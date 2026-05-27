import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { scoreProject } from '@/lib/ai'
import { analyzeWeb3, buildWeb3InsightSummary } from '@/lib/web3insight'
import { analyzeCodeWithLLM, computeFakeCodeFlags } from '@/lib/code-analysis'

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

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const GITHUB_API = 'https://api.github.com'

function githubHeaders() {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'HackAgent/1.0',
  }
  if (GITHUB_TOKEN) h['Authorization'] = `Bearer ${GITHUB_TOKEN}`
  return h
}

function parseGithubUrl(url: string): [string, string] | null {
  if (!url) return null
  const m = url.match(/github\.com[/:]([^/]+)\/([^/\s?#]+)/)
  if (!m) return null
  const repo = m[2].replace(/\.git$/, '').replace(/\/$/, '')
  return [m[1], repo]
}

async function ghGet(path: string): Promise<unknown> {
  await new Promise(r => setTimeout(r, 300 + Math.random() * 500))
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) return null
  return res.json()
}

async function analyzeGithub(owner: string, repo: string) {
  const repoData = await ghGet(`/repos/${owner}/${repo}`) as Record<string, unknown> | null
  if (!repoData) return { error: 'repo_not_found', tree: [] }

  const result: Record<string, unknown> = {
    stars: repoData.stargazers_count ?? 0,
    forks: repoData.forks_count ?? 0,
    open_issues: repoData.open_issues_count ?? 0,
    size_kb: repoData.size ?? 0,
    is_fork: repoData.fork ?? false,
    created_at: repoData.created_at,
    updated_at: repoData.updated_at,
    description: repoData.description ?? '',
    topics: repoData.topics ?? [],
    default_branch: repoData.default_branch ?? 'main',
  }

  // Parallel: languages, contributors, commits (30d), owner info, tree
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString()
  const [languages, contributors, commits, ownerInfo, tree] = await Promise.all([
    ghGet(`/repos/${owner}/${repo}/languages`),
    ghGet(`/repos/${owner}/${repo}/contributors?per_page=10&anon=1`),
    ghGet(`/repos/${owner}/${repo}/commits?since=${since30d}&per_page=100`),
    ghGet(`/users/${owner}`),
    ghGet(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=0`),
  ])

  if (languages && typeof languages === 'object' && !Array.isArray(languages)) {
    const langs = languages as Record<string, number>
    const total = Object.values(langs).reduce((a, b) => a + b, 0)
    result.languages = Object.fromEntries(
      Object.entries(langs)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([lang, bytes]) => [lang, { bytes, pct: Math.round(bytes / total * 100) }])
    )
  } else {
    result.languages = {}
  }

  result.contributors_count = Array.isArray(contributors) ? contributors.length : 0
  // Store top contributors (login + contributions)
  if (Array.isArray(contributors)) {
    type GhContrib = { login?: string; contributions?: number }
    result.contributors = (contributors as GhContrib[]).slice(0, 10).map(c => ({
      login: c.login ?? 'unknown',
      contributions: c.contributions ?? 0,
    }))
  }
  result.commit_count_30d = Array.isArray(commits) ? commits.length : 0

  // Owner account age (mirrors hackathon-analyzer)
  let ownerCreatedDaysAgo: number | null = null
  if (ownerInfo && typeof ownerInfo === 'object') {
    const oi = ownerInfo as Record<string, unknown>
    if (typeof oi.created_at === 'string') {
      try {
        const created = new Date(oi.created_at)
        ownerCreatedDaysAgo = Math.floor((Date.now() - created.getTime()) / 86400000)
        result.owner_created_days_ago = ownerCreatedDaysAgo
      } catch {}
    }
  }

  // Tree-based flags
  type TreeItem = { path: string; type: string; size?: number }
  let treeItems: TreeItem[] = []
  if (tree && typeof tree === 'object') {
    const t = tree as { tree?: TreeItem[] }
    if (Array.isArray(t.tree)) {
      treeItems = t.tree
      const files = treeItems.map(f => f.path.toLowerCase())
      result.has_readme = files.some(f => f.startsWith('readme'))
      result.has_tests = files.some(f => f.includes('test') || f.includes('spec'))
      result.has_docs = files.some(f => f.startsWith('docs/') || f.startsWith('doc/'))
      result.total_files = treeItems.filter(f => f.type === 'blob').length
    }
  }

  // fake_code_flags (partial — llm_fake_code added later after LLM analysis)
  result.fake_code_flags = computeFakeCodeFlags({
    isFork: result.is_fork as boolean,
    commitCount30d: result.commit_count_30d as number,
    contributorsCount: result.contributors_count as number,
    ownerCreatedDaysAgo,
    tree: treeItems,
    isRealCode: null,
  })

  result.analyzed_at = new Date().toISOString()
  // Pass tree forward for LLM code analysis (not persisted)
  return { ...result, _tree: treeItems }
}

// POST /api/projects/[projectId]/review
export async function POST(
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
    .select('id, name, github_url, demo_url, description, event_id, extra_fields, analysis_result, analysis_status')
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
    const eventOwnerId = (event as { user_id?: string }).user_id
    if (eventOwnerId !== effectiveUserId) {
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
  const runningUpdate: Record<string, unknown> = isSonarOnlyRerun ? {} : { analysis_status: 'running' }
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
            triggered_at: completedAt,
          },
          analysis_log: [...existingLog, logEntry],
        })
        .eq('id', projectId)

      return NextResponse.json({ success: true, result: analysisResult })
    }

    // 1. GitHub analysis + LLM code analysis (parallel)
    let githubResult: Record<string, unknown> | null = null
    let codeAnalysis = null
    let web3Analysis = null
    let web3Summary = '无Web3开发记录'
    if (project.github_url) {
      const parsed = parseGithubUrl(project.github_url)
      if (parsed) {
        const [owner, repo] = parsed
        const ghRaw = await analyzeGithub(owner, repo) as Record<string, unknown>

        // Extract tree (internal, not persisted) and run LLM code analysis in parallel with Web3
        const treeItems = (ghRaw._tree ?? []) as Array<{ path: string; type: string; size?: number }>
        delete ghRaw._tree

        // LLM code analysis — mirrors hackathon-analyzer _llm_business_match
        const codeAnalysisPromise = analyzeCodeWithLLM(
          owner, repo, treeItems,
          project.name,
          project.description ?? ''
        )

        // 2. Web3Insight analysis (parallel with LLM code analysis)
        // Build extraText from all project text fields to extract Twitter handle
        const extraFields = project.extra_fields as Record<string, string> | null
        const extraText = [
          project.description ?? '',
          project.demo_url ?? '',
          extraFields ? Object.values(extraFields).join(' ') : '',
        ].join(' ')

        const web3Promise = web3Enabled
          ? analyzeWeb3(project.github_url, extraText)
          : Promise.resolve(null)

        const [codeResult, web3Result] = await Promise.all([codeAnalysisPromise, web3Promise])
        codeAnalysis = codeResult
        web3Analysis = web3Result

        // Merge LLM fake_code signal into github flags
        if (codeResult.is_real_code === false) {
          const flags = (ghRaw.fake_code_flags as string[]) ?? []
          if (!flags.includes('llm_fake_code')) flags.push('llm_fake_code')
          ghRaw.fake_code_flags = flags
        }
        ghRaw.llm_code_analysis = codeResult

        githubResult = ghRaw
      }
    }

    // Update web3Summary if web3Analysis was fetched
    if (web3Analysis) {
      web3Summary = buildWeb3InsightSummary(web3Analysis)
    } else if (web3Enabled && project.github_url && !parseGithubUrl(project.github_url)) {
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
    }> = []

    if (dimensions.length > 0) {
      // Parallel AI scoring across models
      const results = await Promise.all(modelsToUse.map(async modelKey => {
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
          const stack = err instanceof Error ? err.stack : String(err)
          console.error(`[review] model ${modelKey} failed:`, stack)
          return { model: modelKey, score: 0, dimensions: {}, summary: `[ERROR] ${stack}`, error: true } as never
        }
      }))
      aiReviews.push(...results)
    }

    // 5. Write back
    const analysisResult = {
      github_analysis: githubResult,
      ai_reviews: aiReviews,
      sonar_analysis: sonarResult,
      web3_analysis: web3Analysis,
      analyzed_at: new Date().toISOString(),
    }

    const logEntry = {
      ts: new Date().toISOString(),
      status: 'completed',
      github: !!githubResult,
      web3: !!web3Analysis,
      web3_status: web3Analysis?.web3insight?.status ?? (web3Enabled ? 'not_run' : 'disabled'),
      web3_errors: web3Analysis?.web3insight?.errors ?? [],
      sonar: !!sonarResult,
      models: aiReviews.map(r => r.model),
    }

    // Fetch existing log to append
    const { data: cur } = await db.from('projects').select('analysis_log').eq('id', projectId).single()
    const existingLog = Array.isArray(cur?.analysis_log) ? cur.analysis_log : []

    // Check error rate - reset status to 'error' if >80% of ai_reviews failed
    const errorRate = aiReviews.length > 0
      ? aiReviews.filter((r: Record<string, unknown>) => r.error).length / aiReviews.length
      : 0
    const finalStatus = errorRate > 0.8 ? 'error' : 'completed'

    await db
      .from('projects')
      .update({
        analysis_status: finalStatus,
        analysis_result: analysisResult,
        github_analysis: githubResult,
        reviewer_submissions: aiReviews,
        sonar_analysis: sonarResult,
        web3_analysis: web3Analysis,
        analysis_log: [...existingLog, logEntry],
      })
      .eq('id', projectId)

    return NextResponse.json({ success: true, result: analysisResult })
  } catch (err) {
    const errEntry = { ts: new Date().toISOString(), status: 'error', error: String(err) }
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
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
