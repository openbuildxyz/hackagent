import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey } from '@/lib/agent-auth'

// POST /api/agent/events/[eventId]/teams — create a team for an event
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

  // Verify event exists
  const { data: event } = await db
    .from('events')
    .select('id')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) {
    return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 })
  }

  const body = await request.json() as {
    name: string
    description?: string
    registration_id: string
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 })
  }
  if (!body.registration_id) {
    return NextResponse.json({ success: false, error: 'registration_id is required' }, { status: 400 })
  }

  // Verify registration belongs to the API key user and is for this event
  const { data: reg } = await db
    .from('registrations')
    .select('id, status')
    .eq('id', body.registration_id)
    .eq('event_id', eventId)
    .eq('user_id', auth.userId)
    .single()

  if (!reg) {
    return NextResponse.json({ success: false, error: 'Registration not found or not yours' }, { status: 403 })
  }

  // Create team
  const { data: team, error } = await db
    .from('teams')
    .insert({
      event_id: eventId,
      name: body.name.trim(),
      description: body.description ?? null,
      leader_id: auth.userId,
      status: 'open',
    })
    .select('id, name, status, created_at')
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Add creator as leader in team_members
  await db.from('team_members').insert({
    team_id: team.id,
    user_id: auth.userId,
    role: 'leader',
  })

  return NextResponse.json(
    { success: true, data: { id: team.id, name: team.name, status: team.status, created_at: team.created_at } },
    { status: 201 }
  )
}
