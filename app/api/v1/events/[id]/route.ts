import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAgentUser } from '@/lib/agentAuth'

// GET /api/v1/events/[id] — 公开，返回单个活动详情
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = createServiceClient()

  const { data: event, error } = await db
    .from('events')
    .select('id, name, description, status, registration_config, tracks, registration_deadline, submission_deadline, result_announced_at, banner_url, public_vote')
    .eq('id', id)
    .neq('status', 'draft')
    .is('deleted_at', null)
    .single()

  if (error || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  return NextResponse.json(event)
}

const PATCH_ALLOWED_FIELDS = [
  'name',
  'description',
  'tracks',
  'registration_deadline',
  'submission_deadline',
  'registration_config',
] as const

type PatchField = (typeof PATCH_ALLOWED_FIELDS)[number]

type PatchBody = Partial<{
  name: string
  description: string | null
  tracks: Array<{ id?: string; name: string; description?: string; prize?: string }>
  registration_deadline: string | null
  submission_deadline: string | null
  registration_config: { open?: boolean; auto_approve?: boolean; fields?: unknown[] }
}>

// PATCH /api/v1/events/[id] — organizer/admin agent 更新自己拥有的 draft 活动
export async function PATCH(
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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // 白名单字段校验：任何不在白名单的字段直接拒绝
  for (const key of Object.keys(body)) {
    if (!(PATCH_ALLOWED_FIELDS as readonly string[]).includes(key)) {
      return NextResponse.json(
        { error: 'EVENT_PATCH_FORBIDDEN_FIELD', field: key },
        { status: 400 }
      )
    }
  }

  const db = createServiceClient()

  const { data: event, error: fetchError } = await db
    .from('events')
    .select('id, user_id, status, registration_deadline, submission_deadline')
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
    return NextResponse.json({ error: 'EVENT_PATCH_NOT_DRAFT' }, { status: 409 })
  }

  const patch = body as PatchBody

  // registration_deadline 校验：不能提前（相对已有值），也不能设过去时间（OPE-112）
  if (Object.prototype.hasOwnProperty.call(body, 'registration_deadline')) {
    const nextDeadline = patch.registration_deadline
    if (nextDeadline) {
      // 新值必须是未来时间
      if (!(new Date(nextDeadline).getTime() > Date.now())) {
        return NextResponse.json({ error: 'EVENT_PATCH_DEADLINE_PASSED', message: 'registration_deadline must be in the future' }, { status: 400 })
      }
      // 新值不能早于已有值
      if (event.registration_deadline && new Date(nextDeadline).getTime() < new Date(event.registration_deadline).getTime()) {
        return NextResponse.json({ error: 'EVENT_PATCH_DEADLINE_EARLIER' }, { status: 400 })
      }
    }
  }

  // 合成最终的 registration / submission deadline（用 body 覆盖 DB 中的值）
  const finalRegistrationDeadline = Object.prototype.hasOwnProperty.call(body, 'registration_deadline')
    ? patch.registration_deadline ?? null
    : event.registration_deadline
  const finalSubmissionDeadline = Object.prototype.hasOwnProperty.call(body, 'submission_deadline')
    ? patch.submission_deadline ?? null
    : event.submission_deadline

  if (
    finalRegistrationDeadline &&
    finalSubmissionDeadline &&
    new Date(finalSubmissionDeadline).getTime() <= new Date(finalRegistrationDeadline).getTime()
  ) {
    return NextResponse.json({ error: 'EVENT_PATCH_DEADLINE_INVALID_ORDER' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  const updatedFields: PatchField[] = []
  for (const key of PATCH_ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      let value = (patch as Record<string, unknown>)[key]
      if (key === 'name' && typeof value === 'string') {
        value = value.trim()
      }
      if (key === 'description' && typeof value === 'string') {
        value = value.trim()
      }
      updates[key] = value
      updatedFields.push(key)
    }
  }

  if (updatedFields.length === 0) {
    return NextResponse.json({ id: event.id, updated_fields: [] })
  }

  const { error: updateError } = await db
    .from('events')
    .update(updates)
    .eq('id', id)
    .eq('status', 'draft')

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ id: event.id, updated_fields: updatedFields })
}
