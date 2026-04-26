import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

// PATCH /api/events/[eventId]/projects/[projectId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; projectId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId, projectId } = await params
  const db = createServiceClient()

  // Only event owner can edit
  const { data: event } = await db.from('events').select('id').eq('id', eventId).eq('user_id', session.userId).single()
  if (!event) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const allowed = ['name', 'github_url', 'demo_url', 'team_name', 'description', 'tags', 'track_ids', 'extra_fields', 'logo_url']
  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) {
      if (k === 'extra_fields') update[k] = body[k]  // jsonb, keep as-is
      else update[k] = body[k] === '' ? null : body[k]
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const { error } = await db.from('projects').update(update).eq('id', projectId).eq('event_id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
