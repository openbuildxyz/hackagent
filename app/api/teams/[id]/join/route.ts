import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'

// POST /api/teams/[id]/join — apply to join a team
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId } = await params
  const supabase = createServiceClient()

  // Verify team exists and is open
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, leader_id, max_members, status')
    .eq('id', teamId)
    .single()

  if (teamError || !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.status === 'disbanded') {
    return NextResponse.json({ error: 'Team has been disbanded' }, { status: 400 })
  }
  if (team.status === 'locked') {
    return NextResponse.json({ error: 'Team is locked' }, { status: 400 })
  }
  if (team.status !== 'open') {
    return NextResponse.json({ error: 'Team is not accepting new members' }, { status: 400 })
  }
  if (team.leader_id === user.userId) {
    return NextResponse.json({ error: 'You are the leader of this team' }, { status: 400 })
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', user.userId)
    .maybeSingle()

  if (existingMember) {
    return NextResponse.json({ error: 'Already a member of this team' }, { status: 400 })
  }

  // Check existing pending request
  const { data: existingRequest } = await supabase
    .from('team_join_requests')
    .select('id, status')
    .eq('team_id', teamId)
    .eq('user_id', user.userId)
    .maybeSingle()

  if (existingRequest) {
    return NextResponse.json(
      { error: `Already have a ${existingRequest.status} request for this team` },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { message } = body

  const { data: request, error } = await supabase
    .from('team_join_requests')
    .insert({
      team_id: teamId,
      user_id: user.userId,
      message: message || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ request }, { status: 201 })
}
