import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAgentUser } from '@/lib/agentAuth'

// POST /api/v1/events/[id]/cancel — organizer/admin agent cancels a non-terminal event (OPE-100 status v1.1)
// Body: { reason?: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const user = await getAgentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.role.includes('admin') && !user.role.includes('organizer')) {
    return NextResponse.json({ error: 'Forbidden: requires admin or organizer role' }, { status: 403 })
  }

  const db = createServiceClient()

  const { data: event, error: fetchError } = await db
    .from('events')
    .select('id, user_id, status, registration_config')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  if (event.user_id !== user.userId) {
    return NextResponse.json({ error: 'Forbidden: not the event owner' }, { status: 403 })
  }

  if (event.status === 'done') {
    return NextResponse.json({ error: 'EVENT_CANCEL_ALREADY_DONE' }, { status: 409 })
  }
  if (event.status === 'cancelled') {
    return NextResponse.json({ error: 'EVENT_CANCEL_ALREADY_CANCELLED' }, { status: 409 })
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  const prevConfig = (event.registration_config ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancelled_reason: reason || null,
  }
  if (event.registration_config !== null && event.registration_config !== undefined) {
    update.registration_config = { ...prevConfig, open: false }
  }

  const { error: updateError } = await db
    .from('events')
    .update(update)
    .eq('id', id)
    .neq('status', 'done')
    .neq('status', 'cancelled')

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ id: event.id, status: 'cancelled' })
}
