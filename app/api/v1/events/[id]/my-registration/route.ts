import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAgentUser } from '@/lib/agentAuth'

// GET /api/v1/events/[id]/my-registration — 需要 Bearer token 鉴权
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAgentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await params
  const db = createServiceClient()

  const { data: reg, error } = await db
    .from('registrations')
    .select('id, status, team_name, github_url, extra_fields, submitted_at, rejection_reason')
    .eq('event_id', eventId)
    .eq('user_id', user.userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!reg) {
    return NextResponse.json({ error: 'Not registered' }, { status: 404 })
  }

  const result: Record<string, unknown> = {
    id: reg.id,
    status: reg.status,
    team_name: reg.team_name,
    github_url: reg.github_url,
    extra_fields: reg.extra_fields,
    created_at: reg.submitted_at,
  }

  if (reg.rejection_reason) {
    result.rejection_reason = reg.rejection_reason
  }

  return NextResponse.json(result)
}
