import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'
import { teamMutableStatus } from '@/lib/event-status'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId } = await params
  const { user_id: nextLeaderId } = await req.json().catch(() => ({})) as { user_id?: string }
  if (!nextLeaderId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  if (nextLeaderId === user.userId) return NextResponse.json({ error: 'Already leader' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, leader_id, status, events!inner(status)')
    .eq('id', teamId)
    .single()

  if (teamError || !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.leader_id !== user.userId) return NextResponse.json({ error: 'Only the team leader can transfer leadership' }, { status: 403 })
  const eventRow = Array.isArray(team.events) ? team.events[0] : team.events
  if (!teamMutableStatus(eventRow?.status)) {
    return NextResponse.json({ error: 'Team membership is locked for this event stage' }, { status: 409 })
  }
  if (team.status === 'disbanded') return NextResponse.json({ error: 'Team has been disbanded' }, { status: 400 })

  const { data: targetMember } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', nextLeaderId)
    .maybeSingle()

  if (!targetMember) return NextResponse.json({ error: 'New leader must be an existing team member' }, { status: 400 })

  const { error: updateError } = await supabase.from('teams').update({ leader_id: nextLeaderId }).eq('id', teamId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await supabase.from('team_members').update({ role: 'member' }).eq('team_id', teamId).eq('user_id', user.userId)
  await supabase.from('team_members').update({ role: 'leader' }).eq('team_id', teamId).eq('user_id', nextLeaderId)

  return NextResponse.json({ ok: true, leader_id: nextLeaderId })
}
