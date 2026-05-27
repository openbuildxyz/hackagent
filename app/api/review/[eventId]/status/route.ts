import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { computeReviewProgress, type ReviewProgressProject, type ReviewProgressQueueRow } from '@/lib/review-progress'

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

  const { data: projectRows } = await admin
    .from('projects')
    .select('id, analysis_status, analysis_result, sonar_analysis')
    .eq('event_id', eventId)

  const projectIds = (projectRows ?? []).map((p: { id: string }) => p.id)
  const safeIds = projectIds.length > 0 ? projectIds : ['__none__']

  // Prefer queue-based project-level progress for VPS worker flow. analysis_queue
  // keeps historical rerun rows, so only the newest row per project is considered.
  const { data: queueRows } = await admin.from('analysis_queue')
    .select('project_id, status, sonar_enabled')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const status = computeReviewProgress({
    eventStatus: event.status,
    modelCount: ((event.models as string[] | null) ?? []).length,
    eventSonarEnabled: (event as { sonar_enabled?: boolean | null }).sonar_enabled,
    projects: (projectRows ?? []) as ReviewProgressProject[],
    queueRows: (queueRows ?? []) as ReviewProgressQueueRow[],
  })

  // Legacy fallback: when there is no queue yet, count completed unique
  // (project, model) pairs across both scoring tables.
  if ((queueRows ?? []).length === 0) {
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

    const seenPairs = new Set((reviewerDone ?? []).map((r) => `${r.project_id}:${r.model}`))
    for (const s of legacyDone ?? []) {
      seenPairs.add(`${s.project_id}:${s.model}`)
    }
    status.completed = seenPairs.size
    status.failed = (legacyFailed ?? 0) + (reviewerFailed ?? 0)
    status.progress = status.total > 0 ? Math.round((status.completed / status.total) * 100) : 0
    status.done = event.status === 'done'
  }

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
    ...status,
    currentProject,
    currentModel,
  })
}
