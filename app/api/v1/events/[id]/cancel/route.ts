import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAgentUser } from '@/lib/agentAuth'
import { canTransitionEventStatus } from '@/lib/event-status'
import { sendEventCancelledEmail } from '@/lib/mail'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getAgentUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role.includes('admin') && !user.role.includes('organizer')) {
    return NextResponse.json({ error: 'Forbidden: requires admin or organizer role' }, { status: 403 })
  }

  const db = createServiceClient()
  const { data: event, error: fetchError } = await db
    .from('events')
    .select('id, user_id, name, status, registration_config')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (event.user_id !== user.userId) return NextResponse.json({ error: 'Forbidden: not the event owner' }, { status: 403 })
  if (!canTransitionEventStatus(event.status, 'cancelled')) {
    return NextResponse.json({ error: `Illegal status transition: ${event.status} -> cancelled` }, { status: 409 })
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const prevConfig = (event.registration_config ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancelled_reason: reason || null,
    registration_config: { ...prevConfig, open: false },
  }

  const { error: updateError } = await db
    .from('events')
    .update(update)
    .eq('id', id)
    .in('status', ['draft', 'upcoming', 'recruiting'])

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { data: registrations } = await db
    .from('registrations')
    .select('users!inner(email)')
    .eq('event_id', id)
    .neq('status', 'rejected')

  const results = await Promise.allSettled((registrations ?? []).map(async row => {
    const userRow = Array.isArray(row.users) ? row.users[0] : row.users
    const email = userRow?.email
    if (!email) return false
    await sendEventCancelledEmail(email, event.name, reason || null)
    return true
  }))
  const cancelledNotified = results.filter(r => r.status === 'fulfilled' && r.value).length

  return NextResponse.json({ id: event.id, status: 'cancelled', cancelledNotified })
}
