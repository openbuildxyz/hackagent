import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAgentUser } from '@/lib/agentAuth'

// POST /api/v1/events/[id]/publish — organizer/admin agent 把 draft 活动发布为 recruiting（见 OPE-86 状态机）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const user = await getAgentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.role.includes('admin') && !user.role.includes('organizer')) {
    return NextResponse.json({ error: 'Forbidden: requires admin or organizer role' }, { status: 403 })
  }

  const db = createServiceClient()

  const { data: event, error: fetchError } = await db
    .from('events')
    .select('id, user_id, status, description, tracks, registration_deadline, submission_deadline')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  if (event.user_id !== user.userId) {
    return NextResponse.json({ error: 'Forbidden: not the event owner' }, { status: 403 })
  }

  if (event.status !== 'draft') {
    return NextResponse.json({ error: 'EVENT_PUBLISH_NOT_DRAFT' }, { status: 409 })
  }

  // 必填校验：按顺序，首个失败即返回
  const description = typeof event.description === 'string' ? event.description.trim() : ''
  if (description.length < 10) {
    return NextResponse.json(
      { error: 'EVENT_PUBLISH_MISSING_DESCRIPTION', message: 'description must be non-empty and at least 10 characters' },
      { status: 400 }
    )
  }

  if (!Array.isArray(event.tracks) || event.tracks.length < 1) {
    return NextResponse.json(
      { error: 'EVENT_PUBLISH_MISSING_TRACKS', message: 'at least one track is required' },
      { status: 400 }
    )
  }

  if (!event.registration_deadline) {
    return NextResponse.json(
      { error: 'EVENT_PUBLISH_MISSING_DEADLINE', message: 'registration_deadline is required' },
      { status: 400 }
    )
  }

  const regDeadline = new Date(event.registration_deadline).getTime()
  if (!(regDeadline > Date.now())) {
    return NextResponse.json(
      { error: 'EVENT_PUBLISH_DEADLINE_PASSED', message: 'registration_deadline must be in the future' },
      { status: 400 }
    )
  }

  if (event.submission_deadline) {
    const subDeadline = new Date(event.submission_deadline).getTime()
    if (!(subDeadline > regDeadline)) {
      return NextResponse.json(
        { error: 'EVENT_PUBLISH_DEADLINE_INVALID_ORDER', message: 'submission_deadline must be after registration_deadline' },
        { status: 400 }
      )
    }
  }

  // OPE-110: publish 时同步开启 registration_config.open，否则 recruiting 状态也无法注册
  const { data: fullEvent } = await db
    .from('events')
    .select('registration_config')
    .eq('id', id)
    .single()

  const prevConfig = (fullEvent?.registration_config ?? {}) as Record<string, unknown>
  const mergedConfig = { ...prevConfig, open: true }

  const { error: updateError } = await db
    .from('events')
    .update({ status: 'recruiting', registration_config: mergedConfig })
    .eq('id', id)
    .eq('status', 'draft')

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ id: event.id, status: 'recruiting' })
}
