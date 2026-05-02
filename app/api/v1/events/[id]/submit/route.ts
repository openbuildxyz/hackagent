import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAgentUser } from '@/lib/agentAuth'
import { validateProjectInput, type ValidationResult } from '@/lib/validate-project'
import { submissionAllowedStatus } from '@/lib/event-status'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAgentUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: eventId } = await params
  const db = createServiceClient()

  const { data: event } = await db
    .from('events')
    .select('id, status, submission_deadline')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!submissionAllowedStatus(event.status)) {
    return NextResponse.json({ error: 'Submissions are only accepted during hacking/open stages' }, { status: 403 })
  }

  const submissionDeadline = event.submission_deadline as string | null
  if (submissionDeadline && new Date(submissionDeadline) < new Date()) {
    return NextResponse.json({ error: 'Submission deadline has passed' }, { status: 400 })
  }

  const { data: reg } = await db
    .from('registrations')
    .select('id, status, team_name')
    .eq('event_id', eventId)
    .eq('user_id', user.userId)
    .single()

  if (!reg) {
    return NextResponse.json({ error: 'You are not registered for this event. Please register first.' }, { status: 403 })
  }
  if (reg.status === 'pending') {
    return NextResponse.json({ error: 'Your registration is still pending approval. Please wait for the organizer to approve your registration before submitting a project.' }, { status: 403 })
  }
  if (reg.status === 'rejected') {
    return NextResponse.json({ error: 'Your registration was not approved. You cannot submit a project.' }, { status: 403 })
  }
  if (reg.status !== 'approved') {
    return NextResponse.json({ error: 'Registration not approved.' }, { status: 403 })
  }

  const { data: teamMember } = await db
    .from('team_members')
    .select('team_id, teams!inner(event_id, status)')
    .eq('user_id', user.userId)
    .eq('teams.event_id', eventId)
    .neq('teams.status', 'disbanded')
    .maybeSingle()
  const teamId = teamMember?.team_id ?? null

  const body = await request.json() as {
    project_name: string
    github_url: string
    description?: string
    demo_url?: string
    extra?: Record<string, string>
  }

  const { project_name, github_url, description, demo_url } = body
  const v = validateProjectInput({ name: project_name, github_url, description, demo_url })
  if (!v.ok) return NextResponse.json({ error: 'Validation failed', details: v.errors }, { status: 400 })

  const { data: existingProject } = await db
    .from('projects')
    .select('id, name, github_url, status, team_id')
    .eq('event_id', eventId)
    .eq('registration_id', reg.id)
    .maybeSingle()

  if (existingProject) {
    const updatePayload: Record<string, unknown> = {
      name: v.sanitized.name,
      github_url: v.sanitized.github_url,
      description: v.sanitized.description,
    }
    if (demo_url !== undefined) updatePayload.demo_url = v.sanitized.demo_url

    const { data: updated, error } = await db
      .from('projects')
      .update(updatePayload)
      .eq('id', existingProject.id)
      .select('id, name, github_url, status, team_id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const version = await recordSubmissionVersion(db, {
      eventId,
      projectId: updated.id,
      registrationId: reg.id,
      teamId: existingProject.team_id ?? teamId,
      userId: user.userId,
      body,
      sanitized: v.sanitized,
    })

    return NextResponse.json({
      id: updated.id,
      project_name: updated.name,
      github_url: updated.github_url,
      status: updated.status,
      updated: true,
      version,
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
  if (demo_url !== undefined) insertPayload.demo_url = v.sanitized.demo_url

  const { data: inserted, error } = await db
    .from('projects')
    .insert(insertPayload)
    .select('id, name, github_url, status, team_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const version = await recordSubmissionVersion(db, {
    eventId,
    projectId: inserted.id,
    registrationId: reg.id,
    teamId,
    userId: user.userId,
    body,
    sanitized: v.sanitized,
  })

  return NextResponse.json({
    id: inserted.id,
    project_name: inserted.name,
    github_url: inserted.github_url,
    status: inserted.status,
    updated: false,
    version,
  }, { status: 200 })
}

async function recordSubmissionVersion(
  db: ReturnType<typeof createServiceClient>,
  input: {
    eventId: string
    projectId: string
    registrationId: string
    teamId: string | null
    userId: string
    body: Record<string, unknown>
    sanitized: ValidationResult['sanitized']
  }
): Promise<number> {
  const { data: latest } = await db
    .from('submissions')
    .select('version')
    .eq('project_id', input.projectId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const version = ((latest?.version as number | undefined) ?? 0) + 1
  const { error } = await db.from('submissions').insert({
    event_id: input.eventId,
    project_id: input.projectId,
    registration_id: input.registrationId,
    team_id: input.teamId,
    user_id: input.userId,
    version,
    name: input.sanitized.name,
    github_url: input.sanitized.github_url,
    demo_url: input.sanitized.demo_url,
    description: input.sanitized.description,
    payload: input.body,
  })

  if (error) throw new Error(error.message)
  return version
}
