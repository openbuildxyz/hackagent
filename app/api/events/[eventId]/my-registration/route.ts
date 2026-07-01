import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

// GET /api/events/[eventId]/my-registration
// Returns the current user's registration for an event, including linked project info
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  const { data: reg, error } = await db
    .from('registrations')
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', session.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!reg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Look up linked project via registration_id
  const { data: proj } = await db
    .from('projects')
    .select('id, name, github_url, demo_url, description, team_name, status, created_at')
    .eq('registration_id', reg.id)
    .maybeSingle()

  const rejectionReason = reg.rejection_reason ?? reg.reject_reason ?? null
  const extraFields = reg.extra_fields && typeof reg.extra_fields === 'object' && !Array.isArray(reg.extra_fields)
    ? reg.extra_fields as Record<string, unknown>
    : {}
  const trackId = reg.track_id ?? extraFields.track_id ?? null

  return NextResponse.json({
    ...reg,
    track_id: trackId,
    rejection_reason: rejectionReason,
    reject_reason: rejectionReason,
    created_at: reg.submitted_at,
    project: proj ?? null,
  })
}
