import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'
import { canTransitionEventStatus, deriveEventStatus, type EventStatus } from '@/lib/event-status'
import { sendEventCancelledEmail } from '@/lib/mail'

const ACTION_TARGET: Record<string, EventStatus> = {
  publish: 'recruiting',
  schedule: 'upcoming',
  close_registration: 'hacking',
  merge_open: 'open',
  start_review: 'judging',
  publish_result: 'done',
  cancel: 'cancelled',
}

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
    .select('id, user_id, name, status, models, mode, start_time, registration_deadline, submission_deadline, judging_end, result_announced_at, registration_config')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (event.user_id !== session.userId && !session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { action?: string; status?: EventStatus; reason?: string }
  const target = body.status ?? (body.action ? ACTION_TARGET[body.action] : undefined)
  if (!target) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  if (!canTransitionEventStatus(event.status, target)) {
    return NextResponse.json({ error: `Illegal status transition: ${event.status} -> ${target}` }, { status: 409 })
  }

  const derived = deriveEventStatus(event)
  if (target === 'open' && derived !== 'open') {
    return NextResponse.json({ error: 'open requires registration_deadline == submission_deadline' }, { status: 409 })
  }

  const prevConfig = (event.registration_config ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = { status: target }
  if (target === 'cancelled') {
    update.cancelled_at = new Date().toISOString()
    update.cancelled_reason = body.reason?.trim() || null
    update.registration_config = { ...prevConfig, open: false }
  } else if (target === 'recruiting') {
    update.registration_config = { ...prevConfig, open: true }
  } else {
    update.registration_config = { ...prevConfig, open: false }
  }

  const { error: updateError } = await db.from('events').update(update).eq('id', eventId).eq('status', event.status)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  let enqueued = 0
  let cancelledNotified = 0

  if (target === 'cancelled') {
    const { data: registrations } = await db
      .from('registrations')
      .select('users!inner(email)')
      .eq('event_id', eventId)
      .neq('status', 'rejected')

    const results = await Promise.allSettled((registrations ?? []).map(async row => {
      const userRow = Array.isArray(row.users) ? row.users[0] : row.users
      const email = userRow?.email
      if (!email) return false
      await sendEventCancelledEmail(email, event.name, body.reason?.trim() || null)
      return true
    }))
    cancelledNotified = results.filter(r => r.status === 'fulfilled' && r.value).length
  }

  if (target === 'judging') {
    await db.from('teams').update({ status: 'locked' }).eq('event_id', eventId).eq('status', 'open')

    const { data: projects } = await db
      .from('projects')
      .select('id')
      .eq('event_id', eventId)
      .or('analysis_status.is.null,analysis_status.eq.error,analysis_status.eq.pending')

    if (projects && projects.length > 0) {
      const projectIds = projects.map(p => p.id)
      await db.from('analysis_queue').delete().in('project_id', projectIds).eq('status', 'pending')
      await db.from('analysis_queue').insert(projectIds.map(pid => ({
        project_id: pid,
        event_id: eventId,
        status: 'pending',
        models: (event.models as string[]) ?? [],
        sonar_enabled: false,
      })))
      await db.from('projects').update({ analysis_status: 'pending' }).in('id', projectIds)
      enqueued = projectIds.length
    }
  }

  return NextResponse.json({ status: target, enqueued, cancelledNotified })
}
