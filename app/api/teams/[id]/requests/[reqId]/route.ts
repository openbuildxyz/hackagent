import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'
import { teamMutableStatus } from '@/lib/event-status'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId, reqId } = await params
  const supabase = createServiceClient()

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, event_id, leader_id, max_members, events!inner(status)')
    .eq('id', teamId)
    .single()

  if (teamError || !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.leader_id !== user.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const eventRow = Array.isArray(team.events) ? team.events[0] : team.events
  if (!teamMutableStatus(eventRow?.status)) {
    return NextResponse.json({ error: 'Team membership is locked for this event stage' }, { status: 409 })
  }

  const { data: joinReq, error: reqError } = await supabase
    .from('team_join_requests')
    .select('id, user_id, status')
    .eq('id', reqId)
    .eq('team_id', teamId)
    .single()

  if (reqError || !joinReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (joinReq.status !== 'pending') return NextResponse.json({ error: 'Request already processed' }, { status: 400 })

  const body = await req.json()
  const { action } = body
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  if (action === 'approve') {
    const { data: existingInEvent } = await supabase
      .from('team_members')
      .select('team_id, teams!inner(event_id, status)')
      .eq('user_id', joinReq.user_id)
      .eq('teams.event_id', team.event_id)
      .neq('teams.status', 'disbanded')
      .maybeSingle()

    if (existingInEvent) {
      return NextResponse.json({ error: 'User already belongs to a team in this event' }, { status: 409 })
    }

    const { count } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)

    if ((count ?? 0) >= team.max_members) return NextResponse.json({ error: 'Team is full' }, { status: 400 })

    const { error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, user_id: joinReq.user_id, role: 'member' })

    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('team_join_requests')
    .update({ status: action === 'approve' ? 'approved' : 'rejected' })
    .eq('id', reqId)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ request: updated })
}
