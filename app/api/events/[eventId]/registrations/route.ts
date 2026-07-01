import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

function normalizeExtraFields(extraFields: unknown, trackId?: unknown): Record<string, unknown> {
  const normalized = extraFields && typeof extraFields === 'object' && !Array.isArray(extraFields)
    ? { ...(extraFields as Record<string, unknown>) }
    : {}
  const normalizedTrackId = normalizeTrackId(trackId)
  if (normalizedTrackId) normalized.track_id = normalizedTrackId
  return normalized
}

function normalizeTrackId(trackId?: unknown): string | null {
  return typeof trackId === 'string' && trackId.trim() ? trackId.trim() : null
}

function withSyntheticTrackId<T extends { extra_fields?: unknown; track_id?: unknown }>(row: T): T & { track_id: unknown } {
  const extraFields = row.extra_fields && typeof row.extra_fields === 'object' && !Array.isArray(row.extra_fields)
    ? row.extra_fields as Record<string, unknown>
    : {}
  return {
    ...row,
    track_id: row.track_id ?? extraFields.track_id ?? null,
  }
}

function isMissingTrackColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error?.message) return false
  return error.message.includes('track_id') && (
    error.message.includes('schema cache') ||
    error.message.includes('column')
  )
}

// GET — event owner or admin: list all registrations for an event
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

  // OPE-25: admin bypass — 任意活动可读报名；否则必须是 owner
  if (!session.isAdmin) {
    const { data: event } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('user_id', session.userId)
      .is('deleted_at', null)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    // admin 仍需 event 存在
    const { data: event } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const { data: registrations, error } = await db
    .from('registrations')
    .select('*, users(email)')
    .eq('event_id', eventId)
    .order('submitted_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json((registrations ?? []).map(withSyntheticTrackId))
}

// POST — authenticated user submits registration
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  // Fetch event registration config
  const { data: event } = await db
    .from('events')
    .select('id, status, registration_config, registration_deadline, submission_deadline')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const config = event.registration_config as {
    open: boolean
    auto_approve: boolean
    fields: Array<{ key: string; label: string; type: string; required: boolean; default?: boolean }>
  } | null

  if (!config?.open) {
    return NextResponse.json({ error: 'Registration is not open' }, { status: 400 })
  }

  if (event.status !== 'recruiting' && event.status !== 'hacking') {
    return NextResponse.json(
      { error: 'Event is not accepting registrations', status: (event as { status?: string }).status ?? null },
      { status: 400 }
    )
  }

  if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
    return NextResponse.json({ error: 'Registration deadline has passed' }, { status: 400 })
  }

  // Check duplicate
  const { data: existing } = await db
    .from('registrations')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (existing) {
    return NextResponse.json({ id: existing.id, status: existing.status, duplicate: true })
  }

  const body = await request.json()
  const { team_name, github_url, track_id, extra_fields } = body

  const status = config.auto_approve ? 'approved' : 'pending'
  const normalizedTrackId = normalizeTrackId(track_id)
  const normalizedExtraFields = normalizeExtraFields(extra_fields, track_id)

  const insertPayload = {
    event_id: eventId,
    user_id: session.userId,
    team_name: team_name ?? null,
    github_url: github_url ?? null,
    track_id: normalizedTrackId,
    extra_fields: normalizedExtraFields,
    status,
  }

  let { data: reg, error } = await db
    .from('registrations')
    .insert(insertPayload)
    .select('id, status')
    .single()

  if (isMissingTrackColumnError(error)) {
    const fallback = await db
      .from('registrations')
      .insert({
        event_id: insertPayload.event_id,
        user_id: insertPayload.user_id,
        team_name: insertPayload.team_name,
        github_url: insertPayload.github_url,
        extra_fields: insertPayload.extra_fields,
        status: insertPayload.status,
      })
      .select('id, status')
      .single()
    reg = fallback.data
    error = fallback.error
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!reg) {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }

  return NextResponse.json({ id: reg.id, status: reg.status })
}
