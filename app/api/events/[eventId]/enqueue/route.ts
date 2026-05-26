import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

type RunMode = 'fresh' | 'retry_failed' | 'rerun_module' | 'rerun_all'
type RunModule = 'sonar' | 'web3' | 'models' | 'all'

type EnqueueBody = {
  models?: string[]
  sonarEnabled?: boolean
  force?: boolean
  mode?: RunMode
  module?: RunModule
  targetProjectIds?: string[]
}

function hasSonarConfig() {
  const clean = (value: string | undefined) => (value ?? '').trim().replace(/^['"]|['"]$/g, '').replace(/\\n$/g, '').trim()
  return Boolean(clean(process.env.SONAR_PROXY_URL) && clean(process.env.SONAR_PROXY_SECRET))
}

// POST /api/events/[eventId]/enqueue
// Enqueue all unanalyzed projects into analysis_queue for VPS worker
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  // Verify ownership or reviewer access (OPE-25: admins can manage any event)
  const { data: event } = await db.from('events').select('id, models, user_id').eq('id', eventId).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Allow admin, owner, or reviewer
  const isOwner = event.user_id === session.userId
  if (!session.isAdmin && !isOwner) {
    const { data: reviewer } = await db.from('event_reviewers').select('id').eq('event_id', eventId).eq('user_id', session.userId).single()
    if (!reviewer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as EnqueueBody
  const mode: RunMode = body.force ? 'rerun_all' : (body.mode ?? 'fresh')
  const runModule: RunModule = body.force ? 'all' : (body.module ?? (mode === 'rerun_module' ? 'sonar' : 'all'))
  const targetProjectIds = Array.isArray(body.targetProjectIds)
    ? body.targetProjectIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []

  if (!['fresh', 'retry_failed', 'rerun_module', 'rerun_all'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }
  if (!['sonar', 'web3', 'models', 'all'].includes(runModule)) {
    return NextResponse.json({ error: 'Invalid module' }, { status: 400 })
  }
  if (mode === 'rerun_module' && runModule !== 'sonar') {
    return NextResponse.json({ error: 'Only module=sonar is supported for rerun_module in Phase 1' }, { status: 400 })
  }

  if ((body.sonarEnabled || runModule === 'sonar') && !hasSonarConfig()) {
    return NextResponse.json({ error: 'SonarQube 未配置完成，当前环境不能开启代码质量分析' }, { status: 503 })
  }

  // Get projects to enqueue
  let baseQuery = db
    .from('projects')
    .select('id, github_url, sonar_analysis, analysis_status')
    .eq('event_id', eventId)

  if (targetProjectIds.length > 0) {
    baseQuery = baseQuery.in('id', targetProjectIds)
  } else if (mode === 'fresh' && runModule === 'sonar') {
    baseQuery = baseQuery.or('analysis_status.is.null,analysis_status.eq.error,analysis_status.eq.running,analysis_status.eq.pending,sonar_analysis.is.null')
  } else if (mode === 'fresh') {
    baseQuery = baseQuery.or('analysis_status.is.null,analysis_status.eq.error,analysis_status.eq.running,analysis_status.eq.pending')
  } else if (mode === 'retry_failed' && runModule !== 'sonar') {
    baseQuery = baseQuery.eq('analysis_status', 'error')
  }
  const { data: projects, error: projErr } = await baseQuery
  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 })

  const selectedProjects = (projects ?? []).filter(project => {
    if (mode === 'rerun_all') return true
    if (mode === 'retry_failed') {
      const modules = ((project as { analysis_modules?: Record<string, { status?: string } | undefined> }).analysis_modules ?? {})
      return project.analysis_status === 'error' || (runModule === 'sonar' && modules.sonar?.status === 'error')
    }
    if (mode === 'rerun_module' && runModule === 'sonar') {
      const modules = ((project as { analysis_modules?: Record<string, { status?: string } | undefined> }).analysis_modules ?? {})
      const isExplicitTarget = targetProjectIds.includes(project.id)
      return Boolean(project.github_url) && (
        isExplicitTarget ||
        !project.sonar_analysis ||
        modules.sonar?.status === 'error'
      )
    }
    return true
  })

  if (!selectedProjects.length) return NextResponse.json({ enqueued: 0, message: 'No projects to enqueue' })

  // Remove existing pending jobs for these projects first
  const projectIds = selectedProjects.map(p => p.id)
  if (mode === 'rerun_all' && targetProjectIds.length === 0) {
    await db.from('analysis_queue').delete().eq('event_id', eventId)
  } else {
    await db
      .from('analysis_queue')
      .delete()
      .eq('event_id', eventId)
      .in('project_id', projectIds)
      .in('status', ['pending', 'running'])
  }

  // Insert new queue entries. Fall back to the legacy schema if Phase 1 migration is not applied yet.
  const baseEntries = projectIds.map(pid => ({
    project_id: pid,
    event_id: eventId,
    status: 'pending',
    models: body.models ?? (event.models as string[] ?? []),
    sonar_enabled: body.sonarEnabled ?? runModule === 'sonar',
  }))
  const entries = baseEntries.map(entry => ({
    ...entry,
    run_mode: mode,
    run_module: runModule,
    retry_scope: mode === 'retry_failed' ? runModule : null,
    force_reset: mode === 'rerun_all',
  }))

  let schemaSupportsRunScope = true
  const { error } = await db.from('analysis_queue').insert(entries)
  if (error) {
    if (/run_mode|run_module|retry_scope|force_reset|schema cache/i.test(error.message)) {
      schemaSupportsRunScope = false
      const legacyInsert = await db.from('analysis_queue').insert(baseEntries)
      if (legacyInsert.error) return NextResponse.json({ error: legacyInsert.error.message }, { status: 500 })
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const now = new Date().toISOString()
  const lastRun = {
    mode,
    module: runModule,
    models: body.models ?? (event.models as string[] ?? []),
    triggered_by: session.userId,
    triggered_at: now,
  }

  if (!schemaSupportsRunScope) {
    await db.from('projects').update({ analysis_status: 'pending' }).in('id', projectIds)
  } else if (mode === 'rerun_all') {
    const update = await db
      .from('projects')
      .update({ analysis_status: 'pending', analysis_modules: {}, analysis_last_run: lastRun })
      .in('id', projectIds)
    if (update.error && /analysis_modules|analysis_last_run|schema cache/i.test(update.error.message)) {
      await db.from('projects').update({ analysis_status: 'pending' }).in('id', projectIds)
    }
  } else if (mode === 'rerun_module' && runModule === 'sonar') {
    await Promise.all(selectedProjects.map(project => {
      const modules = ((project as { analysis_modules?: Record<string, unknown> }).analysis_modules ?? {})
      return db
        .from('projects')
        .update({
          analysis_modules: {
            ...modules,
            sonar: { status: 'pending', updated_at: now, error: null },
          },
          analysis_last_run: lastRun,
        })
        .eq('id', project.id)
    }))
  } else {
    const update = await db.from('projects').update({ analysis_status: 'pending', analysis_last_run: lastRun }).in('id', projectIds)
    if (update.error && /analysis_last_run|schema cache/i.test(update.error.message)) {
      await db.from('projects').update({ analysis_status: 'pending' }).in('id', projectIds)
    }
  }

  return NextResponse.json({ enqueued: entries.length, mode, module: runModule })
}
