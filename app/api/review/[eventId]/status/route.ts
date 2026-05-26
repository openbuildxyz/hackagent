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
    .select('models, status, sonar_enabled')
    .eq('id', eventId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Get all project IDs for this event first
  const { data: projectRows } = await admin
    .from('projects')
    .select('id, sonar_analysis')
    .eq('event_id', eventId)

  const projectIds = (projectRows ?? []).map((p: { id: string }) => p.id)
  // Prefer queue-based progress for VPS worker flow.
  const { data: queueRows, count: queuedCount } = await admin.from('analysis_queue')
    .select('status, sonar_enabled', { count: 'exact' })
    .eq('event_id', eventId)
  const total = queuedCount && queuedCount > 0 ? queuedCount : projectIds.length * event.models.length
  const queueStats = (queueRows ?? []).reduce((acc, row: { status: string | null }) => {
    const key = row.status ?? 'unknown'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const queueCompleted = queueStats.done ?? 0
  const queueFailed = queueStats.error ?? 0
  const sonarRequired = Boolean(event.sonar_enabled || queueRows?.some((row: { sonar_enabled?: boolean | null }) => row.sonar_enabled))
  const sonarCompleted = sonarRequired
    ? (projectRows ?? []).filter((p: { sonar_analysis?: unknown | null }) => Boolean(p.sonar_analysis)).length
    : projectIds.length
  const effectiveQueueCompleted = sonarRequired ? Math.min(queueCompleted, sonarCompleted) : queueCompleted
  const effectiveQueueFailed = queueFailed + (sonarRequired ? Math.max(0, queueCompleted - sonarCompleted) : 0)
  const hasQueueProgress = total > 0 && Object.keys(queueStats).length > 0
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
  const completed = hasQueueProgress ? effectiveQueueCompleted : seenPairs.size
  const failed = hasQueueProgress ? effectiveQueueFailed : (legacyFailed ?? 0) + (reviewerFailed ?? 0)
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const hasActiveQueueJobs = (queueStats.pending ?? 0) > 0 || (queueStats.running ?? 0) > 0
  const done = hasQueueProgress ? !hasActiveQueueJobs && completed + failed >= total : event.status === 'done'

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
    progress,
    done,
    currentProject,
    currentModel,
  })
}
