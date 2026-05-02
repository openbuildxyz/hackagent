import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { sendReviewerInviteEmail, sendReviewerNotifyEmail } from '@/lib/mail'
import { randomBytes } from 'crypto'
import { initReviewerScores } from '@/lib/reviewer-scores'

// GET /api/events/[eventId]/reviewers - list reviewers with status
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  // Verify event ownership or reviewer membership (OPE-22)
  const { data: event } = await db
    .from('events')
    .select('id, user_id')
    .eq('id', eventId)
    .eq('user_id', session.userId)
    .maybeSingle()

  const isOwner = !!event
  let isReviewer = false
  if (!isOwner) {
    const { data: rev } = await db
      .from('event_reviewers')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', session.userId)
      .maybeSingle()
    isReviewer = !!rev
  }

  if (!isOwner && !isReviewer) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Get reviewers with their scoring status
  const { data: reviewers } = await db
    .from('event_reviewers')
    .select('id, user_id, invite_email, invite_status, created_at, users!event_reviewers_user_id_fkey(email)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (!reviewers) {
    return NextResponse.json([])
  }

  // Get project count for this event
  const { count: projectCount } = await db
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  // Get reviewer_scores counts per reviewer
  const { data: scoreCounts } = await db
    .from('reviewer_scores')
    .select('reviewer_id, status')
    .eq('event_id', eventId)

  const scoreMap: Record<string, { total: number; done: number }> = {}
  for (const s of scoreCounts ?? []) {
    if (!scoreMap[s.reviewer_id]) scoreMap[s.reviewer_id] = { total: 0, done: 0 }
    scoreMap[s.reviewer_id].total++
    if (s.status === 'done') scoreMap[s.reviewer_id].done++
  }

  const result = reviewers.map(r => {
    const user = r.users as unknown as { email: string } | null
    const email = user?.email ?? r.invite_email ?? ''
    const counts = r.user_id ? (scoreMap[r.user_id] ?? { total: 0, done: 0 }) : { total: 0, done: 0 }
    const total = projectCount ?? 0
    const inviteStatus = r.invite_status ?? 'active'
    return {
      id: r.id,
      user_id: r.user_id,
      email,
      invite_status: inviteStatus,
      created_at: r.created_at,
      scored: counts.done,
      total,
      status: inviteStatus === 'pending'
        ? 'invite_pending'
        : counts.total === 0 ? 'pending' : counts.done >= total ? 'done' : 'in_progress',
    }
  })

  // OPE-22: 非 owner（reviewer 视角）只回显部分字段 —— 不暴露邀请元数据/邀请邮箱
  if (!isOwner) {
    const masked = result
      .filter(r => r.user_id) // 已激活的 reviewer
      .map(r => ({
        id: r.id,
        user_id: r.user_id,
        email: r.email,
        scored: r.scored,
        total: r.total,
        status: r.status,
      }))
    return NextResponse.json(masked)
  }

  return NextResponse.json(result)
}

// POST /api/events/[eventId]/reviewers - invite reviewer (by user_id or email)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const body = await request.json() as { user_id?: string; email?: string }

  if (!body.user_id && !body.email) {
    return NextResponse.json({ error: 'user_id 或 email 不能为空' }, { status: 400 })
  }

  const db = createServiceClient()

  // Verify event ownership
  const { data: event } = await db
    .from('events')
    .select('id, user_id, name')
    .eq('id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!event) {
    return NextResponse.json({ error: '活动不存在或无权限' }, { status: 404 })
  }

  // Get inviter email for the mail
  const { data: inviter } = await db.from('users').select('email').eq('id', session.userId).single()

  // Case 1: invite by user_id (already registered)
  if (body.user_id) {
    const { data: targetUser } = await db.from('users').select('id, email').eq('id', body.user_id).single()
    if (!targetUser) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

    const { data, error } = await db
      .from('event_reviewers')
      .insert({ event_id: eventId, user_id: body.user_id, invited_by: session.userId, invite_status: 'active' })
      .select('id').single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: '该评委已邀请' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // Send notification email to registered user
    const reviewUrl = `/events/${eventId}/reviewer`
    sendReviewerNotifyEmail(targetUser.email, event.name, inviter?.email ?? 'HackAgent', reviewUrl).catch(() => {})
    initReviewerScores(db, eventId, body.user_id).catch(() => {})
    return NextResponse.json({ id: data.id, type: 'direct' })
  }

  // Case 2: invite by email
  const email = body.email!.trim().toLowerCase()

  // Check if already a registered user
  const { data: existingUser } = await db.from('users').select('id, email').eq('email', email).single()

  if (existingUser) {
    // User exists — add directly
    const { data, error } = await db
      .from('event_reviewers')
      .insert({ event_id: eventId, user_id: existingUser.id, invited_by: session.userId, invite_status: 'active' })
      .select('id').single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: '该评委已邀请' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // Send notification email to existing user
    const reviewUrl = `/events/${eventId}/reviewer`
    sendReviewerNotifyEmail(existingUser.email, event.name, inviter?.email ?? 'HackAgent', reviewUrl).catch(() => {})
    initReviewerScores(db, eventId, existingUser.id).catch(() => {})
    return NextResponse.json({ id: data.id, type: 'direct', email })
  }

  // User doesn't exist — create pending invite
  const inviteToken = randomBytes(32).toString('hex')

  const { data, error } = await db
    .from('event_reviewers')
    .insert({
      event_id: eventId,
      invited_by: session.userId,
      invite_email: email,
      invite_token: inviteToken,
      invite_status: 'pending',
    })
    .select('id').single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '该邮箱已发送过邀请' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Send invite email
  try {
    await sendReviewerInviteEmail(email, inviteToken, event.name, inviter?.email ?? 'HackAgent')
  } catch (mailErr) {
    console.error('[invite] mail failed:', mailErr)
    // Don't fail the request if mail fails — invite record is created
  }

  return NextResponse.json({ id: data.id, type: 'invite_sent', email })
}

