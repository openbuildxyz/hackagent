import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

// POST /api/events/[eventId]/enqueue
// Enqueue all unanalyzed projects into analysis_queue for VPS worker
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  // Verify ownership or reviewer access
  const { data: event } = await db.from('events').select('id, models, user_id').eq('id', eventId).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Allow owner or reviewer
  const isOwner = event.user_id === session.userId
  if (!isOwner) {
    const { data: reviewer } = await db.from('event_reviewers').select('id').eq('event_id', eventId).eq('user_id', session.userId).single()
    if (!reviewer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { models?: string[]; sonarEnabled?: boolean; force?: boolean }

  // Get projects to enqueue
  let baseQuery = db.from('projects').select('id').eq('event_id', eventId)
  if (!body.force) {
    baseQuery = baseQuery.or('analysis_status.is.null,analysis_status.eq.error,analysis_status.eq.running,analysis_status.eq.pending')
  }
  const { data: projects, error: projErr } = await baseQuery
  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 })

  if (!projects?.length) return NextResponse.json({ enqueued: 0, message: 'No projects to enqueue' })

  // Remove existing pending jobs for these projects first
  const projectIds = projects.map(p => p.id)
  await db.from('analysis_queue').delete().eq('event_id', eventId)

  // Insert new queue entries
  const entries = projectIds.map(pid => ({
    project_id: pid,
    event_id: eventId,
    status: 'pending',
    models: body.models ?? (event.models as string[] ?? []),
    sonar_enabled: body.sonarEnabled ?? false,
  }))

  const { error } = await db.from('analysis_queue').insert(entries)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark all as pending
  await db.from('projects').update({ analysis_status: 'pending' }).in('id', projectIds)

  return NextResponse.json({ enqueued: entries.length })
}
