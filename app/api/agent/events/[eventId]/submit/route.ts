import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey } from '@/lib/agent-auth'
import { validateProjectInput } from '@/lib/validate-project'

// POST /api/agent/events/[eventId]/submit — submit a project for an event
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticateApiKey(request)
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  // Verify event exists and check submission deadline
  const { data: event } = await db
    .from('events')
    .select('id, submission_deadline')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) {
    return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 })
  }

  const submissionDeadline = (event as Record<string, unknown>)['submission_deadline'] as string | null
  if (submissionDeadline && new Date(submissionDeadline) < new Date()) {
    return NextResponse.json({ success: false, error: 'Submission deadline has passed' }, { status: 400 })
  }

  // Must have an approved registration
  const { data: reg } = await db
    .from('registrations')
    .select('id, status, team_name')
    .eq('event_id', eventId)
    .eq('user_id', auth.userId)
    .single()

  if (!reg) {
    return NextResponse.json(
      { success: false, error: 'You are not registered for this event. Please register first.' },
      { status: 403 }
    )
  }
  if (reg.status === 'pending') {
    return NextResponse.json(
      { success: false, error: 'Your registration is still pending approval. Please wait for the organizer to approve your registration before submitting a project.' },
      { status: 403 }
    )
  }
  if (reg.status === 'rejected') {
    return NextResponse.json(
      { success: false, error: 'Your registration was not approved. You cannot submit a project.' },
      { status: 403 }
    )
  }
  if (reg.status !== 'approved') {
    return NextResponse.json(
      { success: false, error: 'Registration not approved.' },
      { status: 403 }
    )
  }

  const body = await request.json() as {
    project_name: string
    github_url: string
    demo_url?: string
    description?: string
    track_ids?: string[]
    team_id?: string
  }

  const v = validateProjectInput({
    name: body.project_name,
    github_url: body.github_url,
    description: body.description,
    demo_url: body.demo_url,
  })
  if (!v.ok) {
    return NextResponse.json({ success: false, error: 'Validation failed', details: v.errors }, { status: 400 })
  }

  const projectName = v.sanitized.name

  // Idempotency key: scope to this caller's registration, never a caller-supplied
  // team_name. Looking up by (event_id, name) let one user overwrite another
  // team's project by submitting a matching name.
  const { data: existing } = await db
    .from('projects')
    .select('id, name, github_url, status')
    .eq('event_id', eventId)
    .eq('registration_id', reg.id)
    .maybeSingle()

  if (existing) {
    // Update existing project
    const updatePayload: Record<string, unknown> = {
      name: projectName,
      github_url: body.github_url.trim(),
      description: body.description ?? null,
    }
    if (body.demo_url !== undefined) updatePayload['demo_url'] = body.demo_url
    if (body.track_ids !== undefined) updatePayload['track_ids'] = Array.isArray(body.track_ids) ? body.track_ids.filter(Boolean) : []
    if (body.team_id !== undefined) updatePayload['team_id'] = body.team_id

    const { data: updated, error } = await db
      .from('projects')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('id, name, github_url, status')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: { id: updated.id, project_name: updated.name, github_url: updated.github_url, status: updated.status, updated: true },
    })
  }

  // Insert new project
  const insertPayload: Record<string, unknown> = {
    event_id: eventId,
    registration_id: reg.id,
    name: projectName,
    team_name: reg.team_name,
    github_url: body.github_url.trim(),
    description: body.description ?? null,
    status: 'pending',
  }
  if (body.demo_url !== undefined) insertPayload['demo_url'] = body.demo_url
  if (body.track_ids !== undefined) insertPayload['track_ids'] = Array.isArray(body.track_ids) ? body.track_ids.filter(Boolean) : []
  if (body.team_id !== undefined) insertPayload['team_id'] = body.team_id

  const { data: inserted, error } = await db
    .from('projects')
    .insert(insertPayload)
    .select('id, name, github_url, status')
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { success: true, data: { id: inserted.id, project_name: inserted.name, github_url: inserted.github_url, status: inserted.status, updated: false } },
    { status: 201 }
  )
}
