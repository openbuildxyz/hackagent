import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'
import { recordAdminAction } from '@/lib/admin-audit'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  console.log('[GET /api/events]', { eventId, sessionUserId: session.userId, isAdmin: session.isAdmin })

  // Admin bypass: 可读任意活动
  if (session.isAdmin) {
    const { data: anyEvent } = await db
      .from('events')
      .select('*')
      .eq('id', eventId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!anyEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    return NextResponse.json(anyEvent)
  }

  // Try as owner first
  const { data: event } = await db
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', session.userId)
    .is('deleted_at', null)
    .single()

  if (event) {
    return NextResponse.json(event)
  }

  // Fallback: check if user is a reviewer for this event
  const { data: reviewer } = await db
    .from('event_reviewers')
    .select('event_id')
    .eq('event_id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!reviewer) {
    return NextResponse.json({ error: 'Event not found', debug: { eventId, sessionUserId: session.userId } }, { status: 404 })
  }

  const { data: reviewerEvent } = await db
    .from('events')
    .select('id, name, dimensions, models, web3_enabled, mode, status, track, description, tracks')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!reviewerEvent) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  return NextResponse.json(reviewerEvent)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const body = await request.json()

  // OPE-20/21: 先 SELECT 判归属，非 owner（且非 admin）直接 403，
  // 避免「非 owner PATCH 0 行受影响仍返回 200 success」的虚假成功。
  {
    const db0 = createServiceClient()
    const { data: existing } = await db0
      .from('events')
      .select('user_id')
      .eq('id', eventId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    if (existing.user_id !== session.userId && !session.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  const { name, track, description, dimensions, models, web3_enabled, sonar_enabled, mode, column_mapping, tracks, banner_url, registration_deadline, submission_deadline, registration_config, status, current_reviewing, is_hidden } = body as {
    name?: string
    track?: string | null
    description?: string | null
    dimensions?: Array<{ name: string; weight: number }>
    models?: string[]
    web3_enabled?: boolean
    sonar_enabled?: boolean
    status?: string
    current_reviewing?: string | null
    mode?: string
    column_mapping?: Record<string, string | null>
    tracks?: Array<{ id: string; name: string; description?: string; prize?: string }> | null
    banner_url?: string | null
    registration_deadline?: string | null
    submission_deadline?: string | null
    registration_config?: { open: boolean; auto_approve: boolean; fields: unknown[] } | null
    is_hidden?: boolean
  }

  const db = createServiceClient()

  const updateData: Record<string, unknown> = {}
  if (models !== undefined) updateData.models = models
  if (web3_enabled !== undefined) updateData.web3_enabled = web3_enabled
  if (sonar_enabled !== undefined) updateData.sonar_enabled = sonar_enabled
  if (status !== undefined) updateData.status = status
  if (current_reviewing !== undefined) updateData.current_reviewing = current_reviewing
  if (name !== undefined) updateData.name = name
  if (track !== undefined) updateData.track = track
  if (description !== undefined) updateData.description = description
  if (dimensions !== undefined) updateData.dimensions = dimensions
  if (mode !== undefined) updateData.mode = mode
  if (column_mapping !== undefined) updateData.column_mapping = column_mapping
  if (tracks !== undefined) updateData.tracks = tracks
  if (banner_url !== undefined) updateData.banner_url = banner_url
  if (registration_deadline !== undefined) updateData.registration_deadline = registration_deadline
  if (submission_deadline !== undefined) updateData.submission_deadline = submission_deadline
  if (registration_config !== undefined) updateData.registration_config = registration_config
  if (is_hidden !== undefined) updateData.is_hidden = is_hidden

  const { error } = await db
    .from('events')
    .update(updateData)
    .eq('id', eventId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // OPE-25: audit admin writes on events they don't own
  if (session.isAdmin) {
    const { data: existingRow } = await db
      .from('events')
      .select('user_id')
      .eq('id', eventId)
      .maybeSingle()
    if (existingRow && existingRow.user_id !== session.userId) {
      await recordAdminAction({
        adminUserId: session.userId,
        action: 'event.update',
        target_type: 'event',
        target_id: eventId,
        after: updateData,
        metadata: { owner_user_id: existingRow.user_id },
      })
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  // OPE-20/21: 先 SELECT 判归属，非 owner（且非 admin）直接 403
  const { data: existing } = await db
    .from('events')
    .select('user_id')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  if (existing.user_id !== session.userId && !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db
    .from('events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', eventId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // OPE-25: audit admin deletes on events they don't own
  if (session.isAdmin && existing.user_id !== session.userId) {
    await recordAdminAction({
      adminUserId: session.userId,
      action: 'event.delete',
      target_type: 'event',
      target_id: eventId,
      metadata: { owner_user_id: existing.user_id },
    })
  }

  return NextResponse.json({ success: true })
}
