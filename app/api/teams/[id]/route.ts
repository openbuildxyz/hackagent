import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'
import { teamMutableStatus } from '@/lib/event-status'

// GET /api/teams/[id] — team detail with members and pending requests
//
// Privacy model (fixes OPE-37 / OPE-73):
//  - Members (including leader) see member emails.
//  - Only the leader sees team_join_requests (and applicant emails).
//  - Non-members: member emails are stripped; team_join_requests is hidden,
//    except the caller's own pending/rejected request is returned so the UI
//    can show "Request Pending" state.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: team, error } = await supabase
    .from('teams')
    .select(`
      *,
      team_members(id, user_id, role, joined_at,
        users:user_id(id, email)
      ),
      team_join_requests(id, user_id, message, status, created_at,
        users:user_id(id, email)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !team) return NextResponse.json({ error: error?.message ?? 'Team not found' }, { status: 404 })

  const members = Array.isArray(team.team_members) ? team.team_members : []
  const requests = Array.isArray(team.team_join_requests) ? team.team_join_requests : []

  const isLeader = team.leader_id === user.userId
  const isMember = isLeader || members.some((m: { user_id: string }) => m.user_id === user.userId)

  // Strip email from member rows for non-members.
  const safeMembers = isMember
    ? members
    : members.map((m: { users?: { id: string; email?: string } | null } & Record<string, unknown>) => ({
        ...m,
        users: m.users ? { id: m.users.id } : null,
      }))

  // Only leader sees all join requests. Non-leader members see none.
  // Non-members see only their own request (for UI state), without other applicants.
  let safeRequests: unknown[]
  if (isLeader) {
    safeRequests = requests
  } else if (isMember) {
    safeRequests = []
  } else {
    safeRequests = requests
      .filter((r: { user_id: string }) => r.user_id === user.userId)
      .map((r: { users?: { id: string; email?: string } | null } & Record<string, unknown>) => ({
        ...r,
        users: r.users ? { id: r.users.id } : null,
      }))
  }

  return NextResponse.json({
    team: {
      ...team,
      team_members: safeMembers,
      team_join_requests: safeRequests,
    },
  })
}

// PUT /api/teams/[id] — update team (leader only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  // Verify ownership
  const { data: team, error: fetchError } = await supabase
    .from('teams')
    .select('leader_id, status, events!inner(status)')
    .eq('id', id)
    .single()

  if (fetchError || !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.leader_id !== user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const eventRow = Array.isArray(team.events) ? team.events[0] : team.events
  if (!teamMutableStatus(eventRow?.status)) {
    return NextResponse.json({ error: 'Team membership is locked for this event stage' }, { status: 409 })
  }
  if (team.status === 'disbanded') {
    return NextResponse.json({ error: 'Team has been disbanded' }, { status: 400 })
  }

  const body = await req.json()
  const { name, description, max_members, skills_needed, status } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description
  if (max_members !== undefined) updates.max_members = max_members
  if (skills_needed !== undefined) updates.skills_needed = skills_needed
  if (status !== undefined) {
    if (!['open', 'locked', 'closed'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be open, locked, or closed' },
        { status: 400 }
      )
    }
    updates.status = status
  }

  const { data: updated, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ team: updated })
}

// DELETE /api/teams/[id] — disband team (leader only)
// Soft-disband: set status='disbanded', remove all members and pending join requests.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: team, error: fetchError } = await supabase
    .from('teams')
    .select('leader_id, status, events!inner(status)')
    .eq('id', id)
    .single()

  if (fetchError || !team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  if (team.leader_id !== user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const eventRow = Array.isArray(team.events) ? team.events[0] : team.events
  if (!teamMutableStatus(eventRow?.status)) {
    return NextResponse.json({ error: 'Team membership is locked for this event stage' }, { status: 409 })
  }
  if (team.status === 'disbanded') {
    return NextResponse.json({ error: 'Team already disbanded' }, { status: 400 })
  }

  const { error: membersError } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', id)
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 })

  const { error: requestsError } = await supabase
    .from('team_join_requests')
    .delete()
    .eq('team_id', id)
    .eq('status', 'pending')
  if (requestsError) return NextResponse.json({ error: requestsError.message }, { status: 500 })

  const { error: updateError } = await supabase
    .from('teams')
    .update({ status: 'disbanded' })
    .eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
