import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey } from '@/lib/agent-auth'
import { validateProjectInput } from '@/lib/validate-project'
import { submissionAllowedStatus } from '@/lib/event-status'
import { recordSubmissionVersion } from '@/lib/submissions'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  const { data: event } = await db
    .from('events')
    .select('id, status, submission_deadline')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 })
  if (!submissionAllowedStatus(event.status)) {
    return NextResponse.json({ success: false, error: 'Submissions are only accepted during hacking/open stages' }, { status: 403 })
  }

  const submissionDeadline = event.submission_deadline as string | null
  if (submissionDeadline && new Date(submissionDeadline) < new Date()) {
    return NextResponse.json({ success: false, error: 'Submission deadline has passed' }, { status: 400 })
  }

  const { data: reg } = await db
    .from('registrations')
    .select('id, status, team_name')
    .eq('event_id', eventId)
    .eq('user_id', auth.userId)
    .single()

  if (!reg) return NextResponse.json({ success: false, error: 'You are not registered for this event. Please register first.' }, { status: 403 })
  if (reg.status === 'pending') return NextResponse.json({ success: false, error: 'Your registration is still pending approval. Please wait for the organizer to approve your registration before submitting a project.' }, { status: 403 })
  if (reg.status === 'rejected') return NextResponse.json({ success: false, error: 'Your registration was not approved. You cannot submit a project.' }, { status: 403 })
  if (reg.status !== 'approved') return NextResponse.json({ success: false, error: 'Registration not approved.' }, { status: 403 })

  const { data: teamMember } = await db
    .from('team_members')
    .select('team_id, teams!inner(event_id, status)')
    .eq('user_id', auth.userId)
    .eq('teams.event_id', eventId)
    .neq('teams.status', 'disbanded')
    .maybeSingle()
  const teamId = teamMember?.team_id ?? null

  const body = await request.json() as {
    project_name: string
    github_url: string
    demo_url?: string
    description?: string
    track_ids?: string[]
  }

  const v = validateProjectInput({
    name: body.project_name,
    github_url: body.github_url,
    description: body.description,
    demo_url: body.demo_url,
  })
  if (!v.ok) return NextResponse.json({ success: false, error: 'Validation failed', details: v.errors }, { status: 400 })

  let existing: { id: string; name: string; github_url: string; status: string; team_id: string | null } | null = null
  if (teamId) {
    const { data } = await db
      .from('projects')
      .select('id, name, github_url, status, team_id')
      .eq('event_id', eventId)
      .eq('team_id', teamId)
      .maybeSingle()
    existing = data
  } else {
    const { data } = await db
      .from('projects')
      .select('id, name, github_url, status, team_id')
      .eq('event_id', eventId)
      .eq('registration_id', reg.id)
      .maybeSingle()
    existing = data
  }

  if (existing) {
    const updatePayload: Record<string, unknown> = {
      name: v.sanitized.name,
      github_url: v.sanitized.github_url,
      description: v.sanitized.description,
    }
    if (body.demo_url !== undefined) updatePayload.demo_url = v.sanitized.demo_url
    if (body.track_ids !== undefined) updatePayload.track_ids = Array.isArray(body.track_ids) ? body.track_ids.filter(Boolean) : []

    const { data: updated, error } = await db
      .from('projects')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('id, name, github_url, status, team_id')
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    const version = await recordSubmissionVersion(db, {
      eventId,
      projectId: updated.id,
      registrationId: reg.id,
      teamId: teamId ?? updated.team_id ?? null,
      userId: auth.userId,
      body,
      sanitized: v.sanitized,
    })

    return NextResponse.json({
      success: true,
      data: { id: updated.id, project_name: updated.name, github_url: updated.github_url, status: updated.status, updated: true, version },
    })
  }

  const insertPayload: Record<string, unknown> = {
    event_id: eventId,
    registration_id: reg.id,
    team_id: teamId,
    name: v.sanitized.name,
    team_name: reg.team_name,
    github_url: v.sanitized.github_url,
    description: v.sanitized.description,
    status: 'pending',
  }
  if (body.demo_url !== undefined) insertPayload.demo_url = v.sanitized.demo_url
  if (body.track_ids !== undefined) insertPayload.track_ids = Array.isArray(body.track_ids) ? body.track_ids.filter(Boolean) : []

  const { data: inserted, error } = await db
    .from('projects')
    .insert(insertPayload)
    .select('id, name, github_url, status, team_id')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const version = await recordSubmissionVersion(db, {
    eventId,
    projectId: inserted.id,
    registrationId: reg.id,
    teamId,
    userId: auth.userId,
    body,
    sanitized: v.sanitized,
  })

  return NextResponse.json({
    success: true,
    data: { id: inserted.id, project_name: inserted.name, github_url: inserted.github_url, status: inserted.status, updated: false, version },
  }, { status: 201 })
}
