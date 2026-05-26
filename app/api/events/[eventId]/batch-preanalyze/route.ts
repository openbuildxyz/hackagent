import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'
import { scoreProject } from '@/lib/ai'
import { buildWeb3InsightSummary } from '@/lib/web3insight'

type ProjectRow = {
  id: string
  name: string
  github_url: string | null
  demo_url: string | null
  description: string | null
  github_analysis: Record<string, unknown> | null
  web3_analysis: Record<string, unknown> | null
  sonar_analysis: Record<string, unknown> | null
  analysis_status: string | null
}

/**
 * POST /api/events/[eventId]/batch-preanalyze
 * Owner-only.
 * 1. For each project not yet analyzed: call /api/projects/[projectId]/review (GitHub+Web3+code)
 * 2. After data enrichment, run LLM scoring for every configured model
 * 3. Write results into reviewer_scores for every invited reviewer (as default scores)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  // Verify ownership (OPE-25: admins can manage any event)
  let eventQuery = db.from('events').select('id, name, models, dimensions, web3_enabled, user_id').eq('id', eventId)
  if (!session.isAdmin) eventQuery = eventQuery.eq('user_id', session.userId)
  const { data: event } = await eventQuery.maybeSingle()

  if (!event) return NextResponse.json({ error: '活动不存在或无权操作' }, { status: 404 })

  const body = await request.json().catch(() => ({})) as { force?: boolean }
  const force = body.force === true

  const { data: projects } = await db
    .from('projects')
    .select('id, name, github_url, demo_url, description, github_analysis, web3_analysis, sonar_analysis, analysis_status')
    .eq('event_id', eventId)

  if (!projects?.length) return NextResponse.json({ error: '该活动没有项目' }, { status: 400 })

  // Get all active reviewers
  const { data: reviewers } = await db
    .from('event_reviewers')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('invite_status', 'active')
    .not('user_id', 'is', null)

  const reviewerIds = (reviewers ?? []).map(r => r.user_id as string)

  const models = (event.models as string[]) ?? []
  const dimensions = event.dimensions as Array<{ name: string; weight: number; description?: string }>
  const web3Enabled = event.web3_enabled ?? false
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hackathon.xyz'

  const toAnalyze = force
    ? projects as ProjectRow[]
    : (projects as ProjectRow[]).filter(p => p.analysis_status !== 'completed')

  const alreadyDone = (projects as ProjectRow[]).filter(p => p.analysis_status === 'completed')

  // Step 1: Run data enrichment for projects that need it
  if (toAnalyze.length > 0) {
    await db.from('projects')
      .update({ analysis_status: 'running' })
      .in('id', toAnalyze.map(p => p.id))

    await Promise.allSettled(
      toAnalyze.map(async (project) => {
        try {
          await fetch(`${baseUrl}/api/projects/${project.id}/review`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-user-id': session.userId,
            },
            body: JSON.stringify({ model: models[0] ?? 'minimax', sonarEnabled: false }),
            signal: AbortSignal.timeout(300_000),
          })
        } catch {
          // continue; individual errors don't block others
        }
      })
    )
  }

  // Step 2: Re-fetch all projects with fresh cached data
  const { data: freshProjects } = await db
    .from('projects')
    .select('id, name, github_url, demo_url, description, github_analysis, web3_analysis, sonar_analysis, analysis_status')
    .eq('event_id', eventId)
  
  const allProjects = (freshProjects ?? []) as ProjectRow[]
  const readyProjects = allProjects.filter(p => p.github_analysis || alreadyDone.some(d => d.id === p.id))

  if (readyProjects.length === 0) {
    return NextResponse.json({ success: false, message: '预分析数据不足，请稍后重试', queued: toAnalyze.length })
  }

  // Step 3: For each ready project × each model × each reviewer: run LLM scoring
  const scoringErrors: string[] = []
  let scoringCount = 0

  for (const project of readyProjects) {
    // Build enriched description from cached github data
    const gh = project.github_analysis as Record<string, unknown> | null
    let enrichedDescription = project.description || ''
    if (gh?.readme && typeof gh.readme === 'string' && gh.readme.length > 50) {
      enrichedDescription = gh.readme
    }

    // Build Web3 summary from cache
    let web3Summary: string | undefined
    if (web3Enabled && project.web3_analysis) {
      try {
        web3Summary = buildWeb3InsightSummary(project.web3_analysis as unknown as Parameters<typeof buildWeb3InsightSummary>[0])
      } catch (err) { console.error('[batch-preanalyze] error:', err) }
    }

    // Extract code analysis from cached github_analysis (stored under llm_code_analysis key)
    const codeAnalysis = gh?.llm_code_analysis as { is_real_code?: boolean; business_match_score?: number; code_quality_summary?: string } | null | undefined
    const sonarAnalysis = project.sonar_analysis as Record<string, unknown> | null

    const enrichedProject = {
      id: project.id,
      name: project.name,
      github_url: project.github_url,
      demo_url: project.demo_url,
      description: enrichedDescription,
    }

    // Run each model in parallel
    await Promise.allSettled(
      models.map(async (model) => {
        try {
          const result = await scoreProject(enrichedProject, dimensions, model, web3Enabled, web3Summary, sonarAnalysis, codeAnalysis)

          // Write default scores for every reviewer (upsert - don't overwrite if reviewer already modified)
          const upsertRows = reviewerIds.map(reviewerId => ({
            event_id: eventId,
            project_id: project.id,
            reviewer_id: reviewerId,
            model,
            dimension_prompt: null,
            ai_dimension_scores: result.scores,
            ai_overall_score: result.overall,
            ai_comment: result.comment,
            // Only set final scores if no existing row (handled by onConflict ignoreDuplicates below)
            final_dimension_scores: result.scores,
            final_overall_score: result.overall,
            status: 'done',
            updated_at: new Date().toISOString(),
          }))

          if (upsertRows.length > 0) {
            await db.from('reviewer_scores').upsert(upsertRows, {
              onConflict: 'event_id,project_id,reviewer_id,model',
              ignoreDuplicates: true, // Don't overwrite if reviewer already has scores
            })
          }
          scoringCount++
        } catch (err) {
          scoringErrors.push(`${project.name}/${model}: ${err instanceof Error ? err.message : String(err)}`)
        }
      })
    )
  }

  return NextResponse.json({
    success: true,
    total: allProjects.length,
    analyzed: readyProjects.length,
    models: models.length,
    reviewers: reviewerIds.length,
    scoringCount,
    errors: scoringErrors.length ? scoringErrors : undefined,
  })
}

type BatchProjectStatus = {
  id: string
  name: string
  analysis_status: string | null
  sonar_analysis?: unknown | null
}

type BatchQueueStatus = {
  project_id: string
  status: string | null
  sonar_enabled: boolean | null
}

// GET - check pre-analysis status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  const { data: projects } = await db
    .from('projects')
    .select('id, name, analysis_status, sonar_analysis')
    .eq('event_id', eventId)

  if (!projects) return NextResponse.json({ total: 0, completed: 0, running: 0, pending: 0, partial: 0, error: 0, ready: false })

  const projectIds = projects.map(p => p.id)
  const { data: queues } = await db
    .from('analysis_queue')
    .select('project_id, status, sonar_enabled')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const queueByProject = new Map<string, BatchQueueStatus>()
  for (const q of (queues ?? []) as BatchQueueStatus[]) {
    if (!queueByProject.has(q.project_id)) queueByProject.set(q.project_id, q)
  }

  const total = projects.length
  let completed = 0
  let running = 0
  let pending = 0
  let partial = 0
  let error = 0

  for (const project of projects as BatchProjectStatus[]) {
    const queue = queueByProject.get(project.id)
    const sonarRequired = Boolean(queue?.sonar_enabled)
    const baseCompleted = project.analysis_status === 'completed'
    const sonarCompleted = !sonarRequired || Boolean(project.sonar_analysis)
    if (baseCompleted && sonarCompleted) completed++
    else if (queue?.status === 'error' || project.analysis_status === 'error') error++
    else if (queue?.status === 'running' || project.analysis_status === 'running') running++
    else if (baseCompleted && !sonarCompleted) partial++
    else pending++
  }

  return NextResponse.json({ total, completed, running, pending, partial, error, ready: completed === total && total > 0 })
}
