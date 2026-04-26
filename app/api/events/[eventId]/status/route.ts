import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

// POST /api/events/[eventId]/status
// Body: { action: "publish" | "close_registration" | "start_review" | "publish_result" | "cancel", reason?: string }
// Transitions: draft → recruiting → hacking → judging → done
//                                                       ↘ cancelled (from any non-terminal state)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  const { data: event } = await db
    .from('events')
    .select('id, user_id, status, models, mode, registration_config')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (event.user_id !== session.userId && !session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { action?: string; reason?: string }
  const { action } = body

  if (action === 'publish') {
    if (event.status !== 'draft') {
      return NextResponse.json({ error: 'Event must be in draft status to publish' }, { status: 400 })
    }
    const { error } = await db.from('events').update({ status: 'recruiting' }).eq('id', eventId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'recruiting' })
  }

  if (action === 'close_registration') {
    if (event.status !== 'recruiting') {
      return NextResponse.json({ error: 'Event must be in recruiting status to close registration' }, { status: 400 })
    }
    const { error } = await db.from('events').update({ status: 'hacking' }).eq('id', eventId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'hacking' })
  }

  if (action === 'start_review') {
    if (event.status !== 'recruiting' && event.status !== 'hacking') {
      return NextResponse.json({ error: 'Event must be in recruiting or hacking status to start review' }, { status: 400 })
    }

    // Update event status to judging
    const { error: updateError } = await db.from('events').update({ status: 'judging' }).eq('id', eventId)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Enqueue all unanalyzed projects for background analysis
    const { data: projects } = await db
      .from('projects')
      .select('id')
      .eq('event_id', eventId)
      .or('analysis_status.is.null,analysis_status.eq.error,analysis_status.eq.pending')

    let enqueued = 0
    if (projects && projects.length > 0) {
      const projectIds = projects.map(p => p.id)
      // Remove existing pending jobs for these projects
      await db.from('analysis_queue').delete().in('project_id', projectIds).eq('status', 'pending')
      // Insert new queue entries
      const entries = projectIds.map(pid => ({
        project_id: pid,
        event_id: eventId,
        status: 'pending',
        models: (event.models as string[]) ?? [],
        sonar_enabled: false,
      }))
      await db.from('analysis_queue').insert(entries)
      await db.from('projects').update({ analysis_status: 'pending' }).in('id', projectIds)
      enqueued = projectIds.length
    }

    return NextResponse.json({ status: 'judging', enqueued })
  }

  if (action === 'publish_result') {
    if (event.status !== 'judging') {
      return NextResponse.json({ error: 'Event must be in judging status to publish results' }, { status: 400 })
    }
    const { error } = await db.from('events').update({ status: 'done' }).eq('id', eventId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'done' })
  }

  if (action === 'cancel') {
    if (event.status === 'done') {
      return NextResponse.json({ error: 'Cannot cancel a completed event' }, { status: 400 })
    }
    if (event.status === 'cancelled') {
      return NextResponse.json({ error: 'Event is already cancelled' }, { status: 400 })
    }
    const prevConfig = (event.registration_config ?? {}) as Record<string, unknown>
    const update: Record<string, unknown> = {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: body.reason?.trim() || null,
    }
    if (event.registration_config !== null && event.registration_config !== undefined) {
      update.registration_config = { ...prevConfig, open: false }
    }
    const { error } = await db.from('events').update(update).eq('id', eventId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'cancelled' })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
