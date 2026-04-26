import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser, getSessionUserWithRole } from '@/lib/session'
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/ratelimit'

export async function GET(request: NextRequest) {
  // 60 req/min/IP — matches the public listing; stops a logged-in user from
  // hammering the full events table either intentionally or via a runaway
  // client.
  const rl = await rateLimit({
    bucket: 'events-list',
    key: getClientIp(request),
    limit: 60,
    windowSec: 60,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }

  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // OPE-25: admin 看全部活动；非 admin 仅看自己名下
  let q = db
    .from('events')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!session.isAdmin) {
    q = q.eq('user_id', session.userId)
  }

  const { data: events, error } = await q

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(events)
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, track, description, dimensions, models, web3_enabled, mode, tracks, banner_url, registration_deadline, submission_deadline, registration_config } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: '活动名称不能为空' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: userRow } = await db
    .from('users')
    .select('role')
    .eq('id', session.userId)
    .single()

  if (!userRow?.role?.includes('admin') && !userRow?.role?.includes('organizer')) {
    return NextResponse.json({ error: '无创建权限，请联系管理员申请' }, { status: 403 })
  }

  const { data: event, error } = await db
    .from('events')
    .insert({
      user_id: session.userId,
      name: name.trim(),
      track: track?.trim() || null,
      description: description?.trim() || null,
      dimensions,
      models,
      web3_enabled: web3_enabled ?? false,
      mode: mode ?? 'ai_only',
      tracks: Array.isArray(tracks) ? tracks : [],
      status: 'draft',
      banner_url: banner_url || null,
      registration_deadline: registration_deadline ?? null,
      submission_deadline: submission_deadline ?? null,
      registration_config: registration_config ?? { open: false, auto_approve: false, fields: [] },
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: event.id })
}
