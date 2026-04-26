import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey } from '@/lib/agent-auth'

// POST /api/agent/events/[eventId]/register — register for an event via API key
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticateApiKey(request)
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  // Fetch event config
  const { data: event } = await db
    .from('events')
    .select('id, status, registration_config, registration_deadline')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) {
    return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 })
  }

  const config = event.registration_config as {
    open: boolean
    auto_approve: boolean
    fields: Array<{ key: string; label: string; type: string; required: boolean }>
  } | null

  if (!config?.open) {
    return NextResponse.json({ success: false, error: 'Registration is not open' }, { status: 400 })
  }

  if (event.status !== 'recruiting' && event.status !== 'hacking') {
    return NextResponse.json(
      { success: false, error: 'Event is not accepting registrations', status: event.status },
      { status: 400 }
    )
  }

  if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
    return NextResponse.json({ success: false, error: 'Registration deadline has passed' }, { status: 400 })
  }

  // Check duplicate registration
  const { data: existing } = await db
    .from('registrations')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { success: false, error: 'Already registered', id: existing.id, status: existing.status },
      { status: 409 }
    )
  }

  const body = await request.json() as {
    name: string
    email?: string
    github_url?: string
    team_name?: string
    track_ids?: string[]
    custom_fields?: Record<string, string>
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 })
  }

  const team_name = (body.team_name ?? body.name).trim()
  const github_url = body.github_url ?? null
  const track_ids = Array.isArray(body.track_ids) ? body.track_ids.filter(Boolean) : []
  const extras: Record<string, string> = { ...(body.custom_fields ?? {}) }
  if (body.email) extras['email'] = body.email
  const description = Object.keys(extras).length > 0 ? JSON.stringify(extras) : null

  const status = config.auto_approve ? 'approved' : 'pending'

  const { data: reg, error } = await db
    .from('registrations')
    .insert({
      event_id: eventId,
      user_id: auth.userId,
      team_name,
      github_url,
      description,
      status,
    })
    .select('id, status')
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Auto-create project if auto_approve is on
  if (status === 'approved') {
    await db.from('projects').insert({
      event_id: eventId,
      name: team_name,
      github_url,
      track_ids,
      status: 'pending',
    })
  }

  return NextResponse.json(
    { success: true, data: { id: reg.id, status: reg.status } },
    { status: 201 }
  )
}
