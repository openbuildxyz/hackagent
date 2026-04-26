import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'

// PUT /api/teams/[id]/requests/[reqId] — approve or reject a join request (leader only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId, reqId } = await params
  const supabase = createServiceClient()

  // Verify leader
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, leader_id, max_members')
    .eq('id', teamId)
    .single()

  if (teamError || !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.leader_id !== user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get the request
  const { data: joinReq, error: reqError } = await supabase
    .from('team_join_requests')
    .select('id, user_id, status')
    .eq('id', reqId)
    .eq('team_id', teamId)
    .single()

  if (reqError || !joinReq) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (joinReq.status !== 'pending') {
    return NextResponse.json({ error: 'Request already processed' }, { status: 400 })
  }

  const body = await req.json()
  const { action } = body // 'approve' | 'reject'

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  if (action === 'approve') {
    // Check member count
    const { count } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)

    if ((count ?? 0) >= team.max_members) {
      return NextResponse.json({ error: 'Team is full' }, { status: 400 })
    }

    // Add as member
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, user_id: joinReq.user_id, role: 'member' })

    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  // Update request status
  const { data: updated, error: updateError } = await supabase
    .from('team_join_requests')
    .update({ status: action === 'approve' ? 'approved' : 'rejected' })
    .eq('id', reqId)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ request: updated })
}
