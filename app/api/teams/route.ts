import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'
import { teamMutableStatus } from '@/lib/event-status'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: teams, error } = await supabase
    .from('teams')
    .select(`
      *,
      team_members(id, user_id, role, joined_at,
        users:user_id(id, name)
      )
    `)
    .eq('event_id', eventId)
    .neq('status', 'disbanded')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ teams })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { event_id, name, description, max_members = 4, skills_needed = [] } = body
  if (!event_id || !name) return NextResponse.json({ error: 'event_id and name are required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, status, deleted_at')
    .eq('id', event_id)
    .is('deleted_at', null)
    .single()

  if (eventError || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!teamMutableStatus(event.status)) {
    return NextResponse.json({ error: 'Team creation is not allowed for this event stage' }, { status: 409 })
  }

  const { data: reg } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', event_id)
    .eq('user_id', user.userId)
    .eq('status', 'approved')
    .maybeSingle()

  if (!reg) {
    return NextResponse.json({ error: 'You must have an approved registration for this event' }, { status: 403 })
  }

  const { data: existingTeamMember } = await supabase
    .from('team_members')
    .select('team_id, teams!inner(event_id, status)')
    .eq('user_id', user.userId)
    .eq('teams.event_id', event_id)
    .neq('teams.status', 'disbanded')
    .maybeSingle()

  if (existingTeamMember) {
    return NextResponse.json({ error: 'User already belongs to a team in this event' }, { status: 409 })
  }

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({ event_id, name, description, leader_id: user.userId, max_members, skills_needed, status: 'open' })
    .select()
    .single()

  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 })

  const { error: memberError } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: user.userId, role: 'leader' })

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })
  return NextResponse.json({ team }, { status: 201 })
}
