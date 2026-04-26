import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAgentUser } from '@/lib/agentAuth'
import { validateProjectInput } from '@/lib/validate-project'

// POST /api/v1/events/[id]/submit — 需要 API key 鉴权
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAgentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: eventId } = await params
  const db = createServiceClient()

  // 检查活动是否存在并获取 submission_deadline
  const { data: event } = await db
    .from('events')
    .select('id, submission_deadline')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // 检查提交截止时间
  const submissionDeadline = (event as Record<string, unknown>)['submission_deadline'] as string | null
  if (submissionDeadline && new Date(submissionDeadline) < new Date()) {
    return NextResponse.json({ error: 'Submission deadline has passed' }, { status: 400 })
  }

  // 前置检查：该用户在该活动必须有 approved 的 registration
  const { data: reg } = await db
    .from('registrations')
    .select('id, status, team_name')
    .eq('event_id', eventId)
    .eq('user_id', user.userId)
    .single()

  if (!reg) {
    return NextResponse.json(
      { error: 'You are not registered for this event. Please register first.' },
      { status: 403 }
    )
  }
  if (reg.status === 'pending') {
    return NextResponse.json(
      { error: 'Your registration is still pending approval. Please wait for the organizer to approve your registration before submitting a project.' },
      { status: 403 }
    )
  }
  if (reg.status === 'rejected') {
    return NextResponse.json(
      { error: 'Your registration was not approved. You cannot submit a project.' },
      { status: 403 }
    )
  }
  if (reg.status !== 'approved') {
    return NextResponse.json(
      { error: 'Registration not approved.' },
      { status: 403 }
    )
  }

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

  // 通过 registration_id 查找该用户在本活动的已有 project（幂等 key）
  const { data: existingProject } = await db
    .from('projects')
    .select('id, name, github_url, status')
    .eq('event_id', eventId)
    .eq('registration_id', reg.id)
    .maybeSingle()

  if (existingProject) {
    // UPDATE
    const updatePayload: Record<string, unknown> = {
      name: v.sanitized.name,
      github_url: v.sanitized.github_url,
      description: v.sanitized.description,
    }
    if (demo_url !== undefined) {
      updatePayload['demo_url'] = v.sanitized.demo_url
    }

    const { data: updated, error } = await db
      .from('projects')
      .update(updatePayload)
      .eq('id', existingProject.id)
      .select('id, name, github_url, status')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      id: updated.id,
      project_name: updated.name,
      github_url: updated.github_url,
      status: updated.status,
      updated: true,
    })
  } else {
    // INSERT
    const insertPayload: Record<string, unknown> = {
      event_id: eventId,
      registration_id: reg.id,
      name: v.sanitized.name,
      team_name: reg.team_name,
      github_url: v.sanitized.github_url,
      description: v.sanitized.description,
      status: 'pending',
    }
    if (demo_url !== undefined) {
      insertPayload['demo_url'] = v.sanitized.demo_url
    }

    const { data: inserted, error } = await db
      .from('projects')
      .insert(insertPayload)
      .select('id, name, github_url, status')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      id: inserted.id,
      project_name: inserted.name,
      github_url: inserted.github_url,
      status: inserted.status,
      updated: false,
    }, { status: 200 })
  }
}
