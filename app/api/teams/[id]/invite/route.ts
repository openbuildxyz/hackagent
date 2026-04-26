import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'

// POST /api/teams/[id]/invite — leader invites a user by email or userId
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId } = await params
  const supabase = createServiceClient()

  // Verify requester is the leader
  const { data: team } = await supabase
    .from('teams')
    .select('id, leader_id, max_members, event_id, name, status')
    .eq('id', teamId)
    .single()

  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.leader_id !== user.userId) {
    return NextResponse.json({ error: 'Only the team leader can invite members' }, { status: 403 })
  }
  if (team.status !== 'open') {
    return NextResponse.json({ error: 'Team is not accepting members' }, { status: 400 })
  }

  // Check team is not full
  const { count: memberCount } = await supabase
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)

  if ((memberCount ?? 0) >= team.max_members) {
    return NextResponse.json({ error: 'Team is full' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const { user_id, email } = body as { user_id?: string; email?: string }

  if (!user_id && !email) {
    return NextResponse.json({ error: 'Provide user_id or email' }, { status: 400 })
  }

  // Resolve user
  let targetUserId = user_id
  if (!targetUserId && email) {
    const { data: found } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()
    if (!found) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    targetUserId = found.id
  }

  if (targetUserId === user.userId) {
    return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 })
  }

  // Check not already a member
  const { data: existing } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', targetUserId!)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'User is already a member' }, { status: 400 })

  // Create invite as an auto-approved join request (leader-initiated)
  // Use team_join_requests with status='invited'
  const { data: invite, error } = await supabase
    .from('team_join_requests')
    .upsert({
      team_id: teamId,
      user_id: targetUserId!,
      message: `${user.userId === team.leader_id ? 'Team leader' : 'Member'} invited you to join ${team.name}`,
      status: 'invited',
    }, { onConflict: 'team_id,user_id', ignoreDuplicates: false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invite, message: 'Invitation sent' }, { status: 201 })
}
