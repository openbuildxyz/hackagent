import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'
import { teamMutableStatus } from '@/lib/event-status'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId } = await params
  const supabase = createServiceClient()

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, leader_id, status, events!inner(status)')
    .eq('id', teamId)
    .single()

  if (teamError || !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  const eventRow = Array.isArray(team.events) ? team.events[0] : team.events
  if (!teamMutableStatus(eventRow?.status)) {
    return NextResponse.json({ error: 'Team membership is locked for this event stage' }, { status: 409 })
  }
  if (team.status === 'disbanded') return NextResponse.json({ error: 'Team has been disbanded' }, { status: 400 })

  const isLeader = team.leader_id === user.userId
  const { data: member } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', user.userId)
    .maybeSingle()

  if (!member && !isLeader) return NextResponse.json({ error: 'You are not a member of this team' }, { status: 400 })

  const { data: allMembers } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
  const memberCount = allMembers?.length ?? 0

  if (isLeader && memberCount <= 1) {
    await supabase.from('team_members').delete().eq('team_id', teamId)
    await supabase.from('team_join_requests').delete().eq('team_id', teamId).eq('status', 'pending')
    await supabase.from('teams').update({ status: 'disbanded' }).eq('id', teamId)
    return NextResponse.json({ ok: true, disbanded: true })
  }

  if (isLeader) {
    return NextResponse.json({ error: 'Team leader must transfer leadership before leaving' }, { status: 409 })
  }

  const { error: deleteError } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', user.userId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
