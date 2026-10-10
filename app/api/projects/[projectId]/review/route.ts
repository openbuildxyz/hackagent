import { NextRequest, NextResponse, after } from 'next/server'
import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { scoreProject } from '@/lib/ai'
import { analyzeWeb3, buildWeb3InsightSummary } from '@/lib/web3insight'
import { analyzeCodeWithLLM } from '@/lib/code-analysis'
import { isEventManager } from '@/lib/event-access'
import { loadGithubSnapshot, parseGithubReference, redactError } from '@/lib/github-source'
import { persistedReviewComplete } from '@/worker/review-outcome.mjs'

type RunMode = 'fresh' | 'retry_failed' | 'rerun_module' | 'rerun_all'
type RunModule = 'sonar' | 'web3' | 'models' | 'all'

type SonarConfig = {
  proxyUrl: string
  secret: string
}

function cleanEnv(value: string | undefined): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '').replace(/\\n$/g, '').trim()
}

function getSonarConfig(): SonarConfig | null {
  const proxyUrl = cleanEnv(process.env.SONAR_PROXY_URL)
  const secret = cleanEnv(process.env.SONAR_PROXY_SECRET)
  if (!proxyUrl || !secret) return null
  return { proxyUrl, secret }
}

function requireSonarConfig(): SonarConfig {
  const config = getSonarConfig()
  if (!config) throw new Error('SonarQube is enabled but SONAR_PROXY_URL or SONAR_PROXY_SECRET is missing')
  return config
}

async function runSonarAnalysis(projectName: string, githubUrl: string): Promise<Record<string, unknown>> {
  const { proxyUrl, secret } = requireSonarConfig()
  try {
    const res = await fetch(`${proxyUrl.replace(/\/$/, '')}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Secret': secret },
      body: JSON.stringify({ name: projectName, github_url: githubUrl }),
      signal: AbortSignal.timeout(360000), // 6min timeout
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`SonarQube proxy returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`)
    }
    const result = await res.json() as Record<string, unknown>
    if (!result || typeof result !== 'object') throw new Error('SonarQube proxy returned an empty result')
    return result
  } catch (err) {
    throw new Error(`SonarQube analysis failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function analyzeGithub(reference: NonNullable<ReturnType<typeof parseGithubReference>>) {
  const snapshot = await loadGithubSnapshot(reference)
  const metadata = snapshot.metadata
  const files = snapshot.files
  const languages: Record<string, { bytes: number; pct: number }> = {}
  const codeExtensions: Record<string, string> = { sol: 'Solidity', ts: 'TypeScript', tsx: 'TypeScript',
    js: 'JavaScript', jsx: 'JavaScript', py: 'Python', go: 'Go', rs: 'Rust', html: 'HTML', css: 'CSS' }
  for (const file of files) {
    const language = codeExtensions[file.path.split('.').pop() || '']
    if (language) languages[language] = { bytes: (languages[language]?.bytes || 0) + file.size, pct: 0 }
  }
  const totalBytes = Object.values(languages).reduce((sum, value) => sum + value.bytes, 0)
  for (const language of Object.values(languages)) language.pct = Math.round(language.bytes / totalBytes * 100)
  const result: Record<string, unknown> = {
    stars: metadata.stargazers_count ?? null, forks: metadata.forks_count ?? null,
    is_fork: metadata.fork ?? null, created_at: metadata.created_at ?? null,
    description: metadata.description ?? '', topics: metadata.topics ?? [],
    default_branch: metadata.default_branch ?? null, source_ref: snapshot.ref,
    source_digest: snapshot.digest, source_scope: metadata.source_scope, source_method: 'github_archive', code_analysis_version: 2,
    metadata_error: metadata.metadata_error ?? null, languages,
    contributors_count: null, commit_count_30d: null,
    has_readme: files.some(file => /(^|\/)readme\./i.test(file.path)),
    has_tests: files.some(file => /(^|\/)(tests?|specs?)(\/|$)|\.(test|spec)\./i.test(file.path)),
    has_docs: files.some(file => /(^|\/)(docs?|documentation)\//i.test(file.path)),
    total_files: files.length, analyzed_at: new Date().toISOString(),
    fake_code_flags: metadata.fork === true ? ['fork'] : [],
  }
  return { result, snapshot }
}

// POST /api/projects/[projectId]/review
async function runReview(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getSessionUser()
  // Allow internal server-to-server calls with x-internal-user-id + x-worker-secret headers
  const internalUserId = req.headers.get('x-internal-user-id')
  const workerSecret = req.headers.get('x-worker-secret')
  const expectedSecrets = [process.env.WORKER_SECRET, process.env.INTERNAL_API_SECRET]
    .filter((value): value is string => Boolean(value))
  if (expectedSecrets.length === 0) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  const isWorkerCall = internalUserId === 'worker' && workerSecret !== null && expectedSecrets.includes(workerSecret)
  const effectiveUserId = session?.userId ?? (isWorkerCall ? 'worker' : null)
  if (!effectiveUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  const body = await req.json().catch(() => ({})) as {
    models?: string[]
    sonarEnabled?: boolean
    mode?: RunMode
    module?: RunModule
  }
  const mode: RunMode = body.mode ?? 'fresh'
  const runModule: RunModule = body.module ?? (mode === 'rerun_module' ? 'sonar' : 'all')
  if (!['fresh', 'retry_failed', 'rerun_module', 'rerun_all'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }
  if (!['sonar', 'web3', 'models', 'all'].includes(runModule)) {
    return NextResponse.json({ error: 'Invalid module' }, { status: 400 })
  }
  if (mode === 'rerun_module' && runModule !== 'sonar') {
    return NextResponse.json({ error: 'Only module=sonar is supported for rerun_module in Phase 1' }, { status: 400 })
  }
  const db = createServiceClient()

  // Get project + event dimensions
  const { data: project } = await db
    .from('projects')
    .select('id, name, github_url, demo_url, description, event_id, extra_fields, analysis_result, analysis_status, analysis_modules, analysis_last_run')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: event } = await db
    .from('events')
    .select('dimensions, models, web3_enabled, user_id')
    .eq('id', project.event_id)
    .single()

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Authorize: event owner OR reviewer of the event (skip for worker calls)
  if (!isWorkerCall) {
    if (!(await isEventManager(db, project.event_id, { userId: effectiveUserId }))) {
      const { data: reviewer } = await db
        .from('event_reviewers')
        .select('id')
        .eq('event_id', project.event_id)
        .eq('user_id', effectiveUserId)
        .single()
      if (!reviewer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const dimensions = (event.dimensions as Array<{ name: string; weight: number; description?: string }>) || []
  const modelsToUse: string[] = body.models ?? (event.models as string[]) ?? ['moonshot', 'glm', 'deepseek']
  const web3Enabled = event.web3_enabled ?? false
  const criteriaDigest = createHash('sha256').update(JSON.stringify({ dimensions, web3Enabled, protocol: 2, project: { name: project.name, github_url: project.github_url, demo_url: project.demo_url, description: project.description, additional_sources: project.extra_fields?.code_review_repositories } })).digest('hex')
  const isSonarOnlyRerun = mode === 'rerun_module' && runModule === 'sonar'

  // Credits check & deduct (skip for worker calls)
  const costPerReview = isSonarOnlyRerun ? 0 : modelsToUse.length + (web3Enabled ? 0.5 : 0)
  const creditCost = Math.ceil(costPerReview)
  if (!isWorkerCall) {
    const { data: userRow } = await db.from('users').select('credits').eq('id', effectiveUserId).single()
    const currentCredits = userRow?.credits ?? 0
    if (currentCredits < creditCost) {
      return NextResponse.json({
        error: 'Insufficient credits',
        credits: currentCredits,
        cost: creditCost,
      }, { status: 402 })
    }
    await db.from('users').update({ credits: currentCredits - creditCost }).eq('id', effectiveUserId)
  }

  // Mark running
  const startedAt = new Date().toISOString()
  const initialModules = ((project as { analysis_modules?: Record<string, unknown> }).analysis_modules ?? {})
  const runningUpdate: Record<string, unknown> = isSonarOnlyRerun ? {} : {
    analysis_status: 'running',
    analysis_modules: { ...initialModules, code: { status: 'running', updated_at: startedAt, error: null } },
    analysis_last_run: { mode, module: runModule, models: modelsToUse, triggered_by: effectiveUserId, triggered_at: startedAt },
  }
  if (isSonarOnlyRerun) {
    runningUpdate.analysis_modules = {
      ...initialModules,
      sonar: { status: 'running', updated_at: startedAt, error: null },
    }
    runningUpdate.analysis_last_run = {
      mode,
      module: runModule,
      models: modelsToUse,
      triggered_by: effectiveUserId,
      triggered_at: startedAt,
    }
  }
  await db.from('projects').update(runningUpdate).eq('id', projectId)

  try {
    if (isSonarOnlyRerun) {
      if (!project.github_url) throw new Error('Project has no GitHub URL for SonarQube analysis')

      const sonarResult = await runSonarAnalysis(project.name, project.github_url)
      const completedAt = new Date().toISOString()
      const modules = {
        ...initialModules,
        sonar: { status: 'completed', updated_at: completedAt, error: null },
      }
      const currentAnalysisResult = (project.analysis_result ?? {}) as Record<string, unknown>
      const analysisResult = {
        ...currentAnalysisResult,
        sonar_analysis: sonarResult,
        analyzed_at: completedAt,
      }
      const logEntry = {
        ts: completedAt,
        status: 'completed',
        mode,
        module: runModule,
        sonar: true,
      }

      const { data: cur } = await db.from('projects').select('analysis_log').eq('id', projectId).single()
      const existingLog = Array.isArray(cur?.analysis_log) ? cur.analysis_log : []

      await db
        .from('projects')
        .update({
          sonar_analysis: sonarResult,
          analysis_result: analysisResult,
          analysis_modules: modules,
          analysis_last_run: {
            mode,
            module: runModule,
            models: modelsToUse,
            triggered_by: effectiveUserId,
            triggered_at: startedAt,
          },
          analysis_log: [...existingLog, logEntry],
        })
        .eq('id', projectId)

      return NextResponse.json({ success: true, started_at: startedAt, result: analysisResult })
    }

    // 1. GitHub analysis + LLM code analysis (parallel)
    let githubResult: Record<string, unknown> | null = null
    let codeAnalysis = null
    let web3Analysis = null
    let web3Summary = '无Web3开发记录'
    if (project.github_url) {
      const reference = parseGithubReference(project.github_url)
      if (!reference) throw new Error('GitHub URL must identify a repository, not a user profile')
      const { result: ghRaw, snapshot } = await analyzeGithub(reference)
      const configured = (project.extra_fields as Record<string, unknown> | null)?.code_review_repositories
      const additional = typeof configured === 'string' ? configured.split(/[\n,]+/).map(value => value.trim()).filter(Boolean) : []
      if (additional.length > 2) throw new Error('At most two supplemental code repositories are supported')
      if (additional.length) {
        const references = additional.map(url => {
          const parsed = parseGithubReference(url)
          if (!parsed || parsed.owner.toLowerCase() !== reference.owner.toLowerCase()) {
            throw new Error('Supplemental code repositories must be valid repositories under the submitted GitHub owner')
          }
          return parsed
        }).filter(parsed => parsed.repo !== reference.repo)
        const related = await Promise.all(references.map(parsed => loadGithubSnapshot(parsed)))
        const sources = [snapshot, ...related]
        const evidence = sources.map(source => ({ url: source.reference.url, ref: source.ref,
          digest: source.digest, source_scope: source.metadata.source_scope, files: source.files.length }))
        snapshot.files = sources.flatMap(source => source.files.map(file => ({ ...file,
          path: source.reference.repo + '/' + file.path, repository: source.reference.repo })))
        snapshot.digest = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
        ghRaw.source_digest = snapshot.digest
        ghRaw.source_repositories = evidence
        ghRaw.source_method = 'github_archive_multi'
        ghRaw.total_files = snapshot.files.length
      }
      const previousGithub = (project.analysis_result as { github_analysis?: Record<string, unknown> } | null)?.github_analysis
      const previousCode = previousGithub?.llm_code_analysis as Awaited<ReturnType<typeof analyzeCodeWithLLM>> | undefined
      const readme = snapshot.files.find(file => /^readme\./i.test(file.path))?.content || ''
      const codeAnalysisPromise = mode === 'retry_failed' && previousGithub?.code_analysis_version === 2
        && previousGithub.source_digest === snapshot.digest && project.analysis_result?.criteria_digest === criteriaDigest
        && previousCode && !previousCode.llm_error
        ? Promise.resolve(previousCode)
        : analyzeCodeWithLLM(reference.owner, reference.repo, snapshot.files, project.name,
          (project.description ?? '') + '\nRepository README (context only):\n' + readme.slice(0, 4000),
          { ref: snapshot.ref, digest: snapshot.digest })
      const extraFields = project.extra_fields as Record<string, string> | null
      const extraText = [project.description ?? '', project.demo_url ?? '',
        extraFields ? Object.values(extraFields).join(' ') : ''].join(' ')
      const [codeResult, web3Result] = await Promise.all([
        codeAnalysisPromise,
        web3Enabled ? analyzeWeb3(project.github_url, extraText) : Promise.resolve(null),
      ])
      codeAnalysis = codeResult
      web3Analysis = web3Result
      ghRaw.llm_code_analysis = codeResult
      githubResult = ghRaw
      if (codeResult.llm_error) {
        await db.from('projects').update({
          github_analysis: ghRaw,
          analysis_result: { github_analysis: ghRaw, ai_reviews: [], analyzed_at: new Date().toISOString(), code_analysis_version: 2 },
          analysis_modules: { ...initialModules, code: { status: 'error', updated_at: new Date().toISOString(), error: codeResult.llm_error } },
        }).eq('id', projectId)
        throw new Error(`Code analysis failed: ${codeResult.llm_error}`)
      }
    }

    // Update web3Summary if web3Analysis was fetched
    if (web3Analysis) {
      web3Summary = buildWeb3InsightSummary(web3Analysis)
    } else if (web3Enabled && project.github_url && !parseGithubReference(project.github_url)) {
      // Fallback: URL couldn't be parsed but web3 enabled — still try web3insight
      web3Analysis = await analyzeWeb3(project.github_url, [project.description ?? '', project.demo_url ?? ''].join(' '))
      web3Summary = buildWeb3InsightSummary(web3Analysis)
    }

    // 3. SonarQube (optional)
    let sonarResult: Record<string, unknown> | null = null
    if (body.sonarEnabled && project.github_url) {
      sonarResult = await runSonarAnalysis(project.name, project.github_url)
    }

    // 4. AI scoring - serial loop to avoid Next.js turbopack TDZ bug
    const aiReviews: Array<{
      model: string
      score: number
      dimensions: Record<string, number>
      summary: string | { zh: string; en: string }
      web3_insight?: string
      error?: boolean
      reused?: boolean
    }> = []

    if (dimensions.length > 0) {
      // Parallel AI scoring across models
      const results = await Promise.all(modelsToUse.map(async modelKey => {
        const previous = project.analysis_result as {
          criteria_digest?: string
          github_analysis?: { source_digest?: string; code_analysis_version?: number }
          ai_reviews?: Array<{ model: string; score: number; dimensions: Record<string, number>; summary: string; error?: boolean }>
        } | null
        const reusable = mode === 'retry_failed' && previous?.criteria_digest === criteriaDigest
          && previous.github_analysis?.code_analysis_version === 2
          && previous.github_analysis.source_digest === githubResult?.source_digest
          ? previous.ai_reviews?.find(review => review.model === modelKey && !review.error
            && Number.isFinite(review.score) && review.score >= 1 && review.score <= 10
            && dimensions.every(d => Number.isFinite(review.dimensions?.[d.name]) && review.dimensions[d.name] >= 1 && review.dimensions[d.name] <= 10))
          : undefined
        if (reusable) return { ...reusable, reused: true }
        try {
          const result = await scoreProject(
            {
              name: project.name,
              github_url: project.github_url,
              demo_url: project.demo_url,
              description: project.description,
            },
            dimensions,
            modelKey,
            web3Enabled,
            web3Summary,
            sonarResult,
            codeAnalysis as { is_real_code?: boolean; business_match_score?: number; code_quality_summary?: string } | null
          )
          return {
            model: modelKey,
            score: result.overall,
            dimensions: result.scores,
            summary: result.comment,
            web3_insight: result.web3_insight,
          }
        } catch (err) {
          const stack = redactError(String(err))
          console.error(`[review] model ${modelKey} failed:`, stack)
          return { model: modelKey, score: 0, dimensions: {}, summary: `[ERROR] ${stack}`, error: true } as never
        }
      }))
      aiReviews.push(...results)
    }

    // 5. Write back
    const analysisResult = {
      code_analysis_version: 2,
      criteria_digest: criteriaDigest,
      run_started_at: startedAt,
      github_analysis: githubResult,
      ai_reviews: aiReviews,
      sonar_analysis: sonarResult,
      web3_analysis: web3Analysis,
      analyzed_at: new Date().toISOString(),
    }

    const finishedAt = new Date().toISOString()
    const successfulModels = new Set(aiReviews.filter(review => !review.error && review.score > 0).map(review => review.model))
    const success = modelsToUse.length > 0 && modelsToUse.every(model => successfulModels.has(model))
    const finalStatus = success ? 'completed' : 'error'
    const logEntry = { ts: finishedAt, status: finalStatus, github: !!githubResult,
      code_analysis_version: 2, source_ref: githubResult?.source_ref, source_digest: githubResult?.source_digest,
      web3: !!web3Analysis, sonar: !!sonarResult, models: aiReviews.map(review => review.model) }
    const { data: cur } = await db.from('projects').select('analysis_log').eq('id', projectId).single()
    const existingLog = Array.isArray(cur?.analysis_log) ? cur.analysis_log : []
    const scoreRows = aiReviews.map(review => ({
      project_id: projectId, model: review.model, dimension_scores: review.dimensions,
      overall_score: review.score, comment: typeof review.summary === 'string' ? review.summary : JSON.stringify(review.summary),
      web3_insight: review.web3_insight ?? null, status: review.error ? 'failed' : 'done',
    }))
    const scoreUpdate = await db.from('scores').upsert(scoreRows, { onConflict: 'project_id,model' })
    if (scoreUpdate.error) throw new Error(`Failed to persist model scores: ${scoreUpdate.error.message}`)

    const projectUpdate = await db
      .from('projects')
      .update({
        analysis_status: finalStatus,
        analysis_modules: { ...initialModules,
          code: { status: githubResult ? 'completed' : 'skipped', updated_at: finishedAt, error: null },
          models: { status: finalStatus, updated_at: finishedAt, error: success ? null : 'One or more configured models failed' },
        },
        analysis_result: analysisResult,
        github_analysis: githubResult,
        reviewer_submissions: aiReviews,
        sonar_analysis: sonarResult,
        web3_analysis: web3Analysis,
        analysis_log: [...existingLog, logEntry],
      })
      .eq('id', projectId)

    if (projectUpdate.error) throw new Error(`Failed to persist review: ${projectUpdate.error.message}`)
    return NextResponse.json({ success, started_at: startedAt, result: analysisResult,
      errors: aiReviews.filter(review => review.error).map(review => ({ model: review.model, error: review.summary })) },
      { status: success ? 200 : 502 })
  } catch (err) {
    const errEntry = { ts: new Date().toISOString(), status: 'error', error: redactError(String(err)) }
    const errorUpdate: Record<string, unknown> = isSonarOnlyRerun ? {} : { analysis_status: 'error' }
    if (isSonarOnlyRerun) {
      errorUpdate.analysis_modules = {
        ...initialModules,
        sonar: { status: 'error', updated_at: errEntry.ts, error: String(err) },
      }
      errorUpdate.analysis_last_run = {
        mode,
        module: runModule,
        models: modelsToUse,
        triggered_by: effectiveUserId,
        triggered_at: errEntry.ts,
      }
    }
    await db.from('projects').update(errorUpdate).eq('id', projectId)
    void (async () => {
      try {
        const { data } = await db.from('projects').select('analysis_log').eq('id', projectId).single()
        const log = Array.isArray(data?.analysis_log) ? data.analysis_log : []
        await db.from('projects').update({ analysis_log: [...log, errEntry] }).eq('id', projectId)
      } catch { /* ignore */ }
    })()
    return NextResponse.json({ success: false, started_at: startedAt, error: redactError(String(err)) }, { status: 500 })
  }
}


async function reconcileWorkerResult(projectId: string, payload: Record<string, unknown>) {
  const startedAt = typeof payload.started_at === 'string' ? payload.started_at : null
  if (!startedAt) return
  // Give the legacy worker time to finish its transport update, then reconcile the same attempt.
  await new Promise(resolve => setTimeout(resolve, 1200))
  const db = createServiceClient()
  const [{ data: project }, { data: rows }] = await Promise.all([
    db.from('projects').select('id,analysis_status,analysis_result,analysis_modules,analysis_last_run,sonar_analysis').eq('id', projectId).single(),
    db.from('analysis_queue').select('id,models,sonar_enabled,run_mode,run_module,created_at,started_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1),
  ])
  const queue = rows?.[0]
  if (!project || !queue || project.analysis_last_run?.triggered_at !== startedAt || queue.created_at > startedAt) return
  const complete = persistedReviewComplete(project, queue)
  const error = complete ? null : redactError(String(payload.error || JSON.stringify(payload.errors || 'Review did not complete')))
  const result = await db.from('analysis_queue').update({ status: complete ? 'done' : 'error', error,
    completed_at: new Date().toISOString() }).eq('id', queue.id)
  if (result.error) console.error('[review] queue reconciliation failed:', result.error.message)
  if (complete && project.analysis_status !== 'completed' && queue.run_module !== 'sonar') {
    await db.from('projects').update({ analysis_status: 'completed' }).eq('id', projectId)
      .eq('analysis_last_run->>triggered_at', startedAt)
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const secret = req.headers.get('x-worker-secret')
  const worker = req.headers.get('x-internal-user-id') === 'worker' && secret
    && [process.env.WORKER_SECRET, process.env.INTERNAL_API_SECRET].filter(Boolean).includes(secret)
  if (!worker) return runReview(req, context)
  const { projectId } = await context.params
  const work = runReview(req, context).then(async response => ({
    ...(await response.json() as Record<string, unknown>), http_status: response.status,
  }))
  after(async () => {
    try {
      const result = await work
      await reconcileWorkerResult(projectId, result)
      await new Promise(resolve => setTimeout(resolve, 2500))
      await reconcileWorkerResult(projectId, result)
    }
    catch (error) { console.error('[review] result reconciliation failed:', redactError(String(error))) }
  })
  let cancelled = false
  let timer: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode('\n'))
      timer = setInterval(() => {
        if (!cancelled) controller.enqueue(encoder.encode('\n'))
      }, 4000)
      void work.then(payload => {
        if (!cancelled) { controller.enqueue(encoder.encode(JSON.stringify(payload))); controller.close() }
      }).catch(error => {
        if (!cancelled) { controller.enqueue(encoder.encode(JSON.stringify({ success: false, error: redactError(String(error)) }))); controller.close() }
      }).finally(() => { if (timer) clearInterval(timer) })
    },
    cancel() { cancelled = true; if (timer) clearInterval(timer) },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } })
}
