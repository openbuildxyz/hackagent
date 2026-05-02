import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAgentUser } from '@/lib/agentAuth'

// GET /api/v1/events — 公开，返回 status != draft 的活动列表
export async function GET(_request: NextRequest) {
  const db = createServiceClient()

  const { data: events, error } = await db
    .from('events')
    .select('id, name, description, status, registration_config, tracks, registration_deadline')
    .neq('status', 'draft')
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Only hide finished events whose names look like test/QA fixtures; live events
  // with "test" in the name (e.g. "TestNet Hackathon") remain visible.
  const filtered = (events || []).filter(
    e => !(e.status === 'done' && /test|测试|E2E/i.test(e.name))
  )

  return NextResponse.json(filtered)
}

// POST /api/v1/events — 需要 API key 且 role 包含 admin 或 organizer
export async function POST(request: NextRequest) {
  const user = await getAgentUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.role.includes('admin') && !user.role.includes('organizer')) {
    return NextResponse.json({ error: 'Forbidden: requires admin or organizer role' }, { status: 403 })
  }

  const body = await request.json() as {
    name: string
    description?: string
    tracks?: Array<{ name: string; description?: string; prize?: string }>
    registration_open_at?: string | null
    start_time?: string | null
    registration_deadline?: string
    submission_deadline?: string | null
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const db = createServiceClient()

  const tracks = Array.isArray(body.tracks)
    ? body.tracks.map((t, i) => ({ id: `track_${i + 1}`, ...t }))
    : []

  const { data: event, error } = await db
    .from('events')
    .insert({
      user_id: user.userId,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      tracks,
      registration_open_at: body.registration_open_at ?? null,
      start_time: body.start_time ?? null,
      registration_deadline: body.registration_deadline ?? null,
      submission_deadline: body.submission_deadline ?? null,
      status: 'draft',
      mode: 'ai_only',
      web3_enabled: false,
      registration_config: { open: false, auto_approve: false, fields: [] },
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: event.id }, { status: 201 })
}
