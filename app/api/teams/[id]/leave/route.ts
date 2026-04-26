import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'

// POST /api/teams/[id]/leave — member leaves team
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId } = await params
  const supabase = createServiceClient()

  // Fetch team
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, leader_id, status')
    .eq('id', teamId)
    .single()

  if (teamError || !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.status === 'disbanded') {
    return NextResponse.json({ error: 'Team has been disbanded' }, { status: 400 })
  }

  const isLeader = team.leader_id === user.userId

  // Check membership
  const { data: member } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', user.userId)
    .maybeSingle()

  if (!member && !isLeader) {
    return NextResponse.json({ error: 'You are not a member of this team' }, { status: 400 })
  }

  // Count remaining members (including leader)
  const { data: allMembers } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)

  const memberCount = allMembers?.length ?? 0

  // If leader and last member, disband instead
  if (isLeader && memberCount <= 1) {
    // Disband: delete members, requests, set status
    await supabase.from('team_members').delete().eq('team_id', teamId)
    await supabase.from('team_join_requests').delete().eq('team_id', teamId).eq('status', 'pending')
    await supabase.from('teams').update({ status: 'disbanded' }).eq('id', teamId)
    return NextResponse.json({ ok: true, disbanded: true })
  }

  // Leader leaving but other members exist — transfer leadership first
  if (isLeader) {
    // Pick the earliest joined non-leader member as new leader
    const { data: nextLeader } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId)
      .neq('user_id', user.userId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (nextLeader) {
      // Update team leader
      await supabase.from('teams').update({ leader_id: nextLeader.user_id }).eq('id', teamId)
      // Update member role
      await supabase
        .from('team_members')
        .update({ role: 'leader' })
        .eq('team_id', teamId)
        .eq('user_id', nextLeader.user_id)
    }
  }

  // Remove the member
  const { error: deleteError } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', user.userId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
