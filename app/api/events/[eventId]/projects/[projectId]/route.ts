import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'
import { recordAdminAction } from '@/lib/admin-audit'
import { validateProjectInput } from '@/lib/validate-project'
import { getEventManagerAccess } from '@/lib/event-access'

// PATCH /api/events/[eventId]/projects/[projectId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; projectId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId, projectId } = await params
  const db = createServiceClient()

  const { data: event } = await db
    .from('events')
    .select('id, user_id')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const access = await getEventManagerAccess(db, eventId, session, { select: 'id, user_id' })
  if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const isOwner = access.isOwner

  const { data: project } = await db
    .from('projects')
    .select('id, event_id, name, github_url, demo_url, description, team_name, extra_fields, track_ids, logo_url')
    .eq('id', projectId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const body = await request.json() as Record<string, unknown>
  const validation = validateProjectInput({
    name: 'name' in body ? body.name : project.name,
    github_url: 'github_url' in body ? body.github_url : project.github_url,
    demo_url: 'demo_url' in body ? body.demo_url : project.demo_url,
    description: 'description' in body ? body.description : project.description,
    team_name: 'team_name' in body ? body.team_name : project.team_name,
  })
  if (!validation.ok) {
    return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if ('name' in body) update.name = validation.sanitized.name
  if ('github_url' in body) update.github_url = validation.sanitized.github_url
  if ('demo_url' in body) update.demo_url = validation.sanitized.demo_url
  if ('description' in body) update.description = validation.sanitized.description
  if ('team_name' in body) update.team_name = validation.sanitized.team_name
  if ('track_ids' in body) update.track_ids = body.track_ids
  if ('logo_url' in body) update.logo_url = body.logo_url === '' ? null : body.logo_url
  if ('extra_fields' in body) update.extra_fields = body.extra_fields

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const { data: updated, error } = await db
    .from('projects')
    .update(update)
    .eq('id', projectId)
    .eq('event_id', eventId)
    .select('id, name, github_url, demo_url, description, team_name, extra_fields, track_ids, logo_url')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (session.isAdmin && !isOwner) {
    await recordAdminAction({
      adminUserId: session.userId,
      action: 'project.update',
      target_type: 'project',
      target_id: projectId,
      before: project,
      after: updated,
      metadata: { event_id: eventId, owner_user_id: event.user_id },
    })
  }

  return NextResponse.json({ success: true, project: updated })
}
