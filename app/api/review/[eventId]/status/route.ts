import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  // Status polling is allowed without auth because it only exposes aggregate progress.
  // Event existence is still verified below.

  const { eventId } = await params
  const admin = createServiceClient()

  // Get event status and models
  const { data: event } = await admin
    .from('events')
    .select('models, status')
    .eq('id', eventId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Get all project IDs and coarse project status for this event first.
  // The progress card is project-level, not queue-row-level. analysis_queue keeps
  // historical rerun rows, so counting all rows makes 50 projects look like 103
  // review items after retries / Sonar reruns.
  const { data: projectRows } = await admin
    .from('projects')
    .select('id, analysis_status, analysis_result, sonar_analysis')
    .eq('event_id', eventId)

  const projectIds = (projectRows ?? []).map((p: { id: string }) => p.id)
  const projectStatusById = new Map(
    (projectRows ?? []).map((p: { id: string; analysis_status: string | null }) => [p.id, p.analysis_status])
  )
  const projectDoneByAi = new Map(
    (projectRows ?? []).map((p: { id: string; analysis_result?: { ai_reviews?: Array<{ score?: number | null; error?: boolean | null }> | null } | null }) => [
      p.id,
      (p.analysis_result?.ai_reviews ?? []).filter(review => !review.error && (review.score ?? 0) > 0).length >= event.models.length,
    ])
  )
  const projectHasSonar = new Map(
    (projectRows ?? []).map((p: { id: string; analysis_result?: { sonar_analysis?: unknown | null } | null; sonar_analysis?: unknown | null }) => [
      p.id,
      Boolean(p.sonar_analysis || p.analysis_result?.sonar_analysis),
    ])
  )
  // Prefer queue-based progress for VPS worker flow.
  const { data: queueRows } = await admin.from('analysis_queue')
    .select('project_id, status')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  const latestQueueByProject = new Map<string, string | null>()
  for (const row of queueRows ?? []) {
    if (!latestQueueByProject.has(row.project_id)) latestQueueByProject.set(row.project_id, row.status ?? null)
  }
  const queueTotal = latestQueueByProject.size
  const hasQueueProgress = queueTotal > 0
  const total = hasQueueProgress ? projectIds.length : projectIds.length * event.models.length
  const queueStats = { pending: 0, running: 0, done: 0, error: 0, completedProject: 0 }
  for (const projectId of projectIds) {
    const projectStatus = projectStatusById.get(projectId)
    const queueStatus = latestQueueByProject.get(projectId)
    if (projectStatus === 'completed') queueStats.completedProject += 1
    if (queueStatus === 'pending') queueStats.pending += 1
    else if (queueStatus === 'running') queueStats.running += 1
    else if (queueStatus === 'error') {
      if (projectStatus === 'completed' || projectDoneByAi.get(projectId)) queueStats.done += 1
      else queueStats.error += 1
    }
    else if (queueStatus === 'done') queueStats.done += 1
  }
  const queueCompleted = queueStats.completedProject || queueStats.done
  const queueFailed = queueStats.error
  const safeIds = projectIds.length > 0 ? projectIds : ['__none__']

  // Legacy fallback: count completed unique (project, model) pairs across both tables
  // reviewer_scores takes priority; supplement with scores for pairs not in reviewer_scores
  const [
    { data: reviewerDone },
    { data: legacyDone },
    { count: legacyFailed },
    { count: reviewerFailed },
  ] = await Promise.all([
    admin.from('reviewer_scores').select('project_id,model')
      .in('project_id', safeIds).in('status', ['done', 'ai_done']),
    admin.from('scores').select('project_id,model')
      .in('project_id', safeIds).eq('status', 'done'),
    admin.from('scores').select('*', { count: 'exact', head: true })
      .in('project_id', safeIds).eq('status', 'failed'),
    admin.from('reviewer_scores').select('*', { count: 'exact', head: true })
      .in('project_id', safeIds).eq('status', 'failed'),
  ])

  // Deduplicate: count unique (project_id, model) pairs
  const seenPairs = new Set((reviewerDone ?? []).map((r) => `${r.project_id}:${r.model}`))
  for (const s of legacyDone ?? []) {
    seenPairs.add(`${s.project_id}:${s.model}`)
  }
  const completed = hasQueueProgress ? queueCompleted : seenPairs.size
  const failed = hasQueueProgress ? queueFailed : (legacyFailed ?? 0) + (reviewerFailed ?? 0)
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const active = queueStats.pending + queueStats.running
  const done = hasQueueProgress ? active === 0 && completed + failed >= total : event.status === 'done'

  // Get latest score for "currently reviewing" display
  const { data: latestScore } = await admin
    .from('scores')
    .select('project_id, model, projects(name)')
    .in('project_id', safeIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const currentProject = (latestScore as { projects?: { name?: string } } | null)?.projects?.name
    ?? null
  const currentModel = latestScore?.model ?? null

  return NextResponse.json({
    total,
    completed,
    failed,
    active,
    progress,
    done,
    currentProject,
    currentModel,
  })
}
