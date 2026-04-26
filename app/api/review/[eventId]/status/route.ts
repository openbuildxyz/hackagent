import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  // Also allow no-auth for polling (status is not sensitive), but verify event exists

  const { eventId } = await params
  const admin = createServiceClient()

  // Get event status and models
  const { data: event } = await admin
    .from('events')
    .select('models, status, current_reviewing')
    .eq('id', eventId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Get all project IDs for this event first
  const { data: projectRows } = await admin
    .from('projects')
    .select('id')
    .eq('event_id', eventId)

  const projectIds = (projectRows ?? []).map((p: { id: string }) => p.id)
  // Use queued job count for total (reflects actual enqueue params, not just event.models)
  const { count: queuedCount } = await admin.from('analysis_queue')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds.length > 0 ? projectIds : ['__none__'])
  // Fallback: projects × event.models if no queue
  const total = queuedCount && queuedCount > 0 ? queuedCount : projectIds.length * event.models.length
  const safeIds = projectIds.length > 0 ? projectIds : ['__none__']

  // Count completed unique (project, model) pairs across both tables
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
  const completed = seenPairs.size
  const failed = (legacyFailed ?? 0) + (reviewerFailed ?? 0)
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const done = event.status === 'done'

  // Get latest score for "currently reviewing" display
  const { data: latestScore } = await admin
    .from('scores')
    .select('project_id, model, projects(name)')
    .in('project_id', safeIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const currentProject = (event as { current_reviewing?: string }).current_reviewing
    ?? (latestScore as { projects?: { name?: string } } | null)?.projects?.name
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
