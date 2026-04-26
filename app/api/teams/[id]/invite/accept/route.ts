import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'

// POST /api/teams/[id]/invite/accept — invitee accepts a team invite
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId } = await params
  const supabase = createServiceClient()

  // Find the invite
  const { data: invite } = await supabase
    .from('team_join_requests')
    .select('id, status')
    .eq('team_id', teamId)
    .eq('user_id', user.userId)
    .eq('status', 'invited')
    .single()

  if (!invite) return NextResponse.json({ error: 'No pending invite found' }, { status: 404 })

  // Check team capacity
  const { data: team } = await supabase
    .from('teams')
    .select('id, max_members, status')
    .eq('id', teamId)
    .single()

  if (!team || team.status !== 'open') {
    return NextResponse.json({ error: 'Team is not open' }, { status: 400 })
  }

  const { count } = await supabase
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)

  if ((count ?? 0) >= team.max_members) {
    return NextResponse.json({ error: 'Team is full' }, { status: 400 })
  }

  // Add member + mark invite accepted
  const [{ error: memberErr }, { error: reqErr }] = await Promise.all([
    supabase.from('team_members').insert({ team_id: teamId, user_id: user.userId, role: 'member' }),
    supabase.from('team_join_requests').update({ status: 'accepted' }).eq('id', invite.id),
  ])

  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 })

  return NextResponse.json({ success: true, message: 'Joined team!' })
}
