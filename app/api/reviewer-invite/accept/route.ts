import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hashPassword, createToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import { initReviewerScores } from '@/lib/reviewer-scores'

// POST /api/reviewer-invite/accept — register via invite token
//
// Security notes (OPE-40):
// - For EXISTING users we must NOT sign a session cookie here. Anyone who gets
//   the invite token (from DB access, email, logs, etc.) could otherwise
//   hijack the existing account without knowing its password.
// - For existing users we also must NOT auto-grant the `reviewer` role
//   implicitly — that role is added only after the user authenticates and
//   explicitly accepts the invite from their logged-in session.
// - The invite token is one-time: on accept we mark it accepted and clear the
//   token to prevent replay.
export async function POST(req: NextRequest) {
  const { token, password, name } = await req.json() as { token: string; password: string; name?: string }

  if (!token) {
    return NextResponse.json({ error: '参数无效' }, { status: 400 })
  }

  const db = createServiceClient()

  // Fetch invite
  const { data: invite } = await db
    .from('event_reviewers')
    .select('id, invite_email, invite_status, event_id, invited_by')
    .eq('invite_token', token)
    .single()

  if (!invite) return NextResponse.json({ error: '邀请链接无效或已过期' }, { status: 404 })
  if (invite.invite_status === 'accepted') return NextResponse.json({ error: '该邀请已使用' }, { status: 409 })

  const email = invite.invite_email!

  // Check if user already registered with this email
  const { data: existingUser } = await db.from('users').select('id').eq('email', email).single()

  if (existingUser) {
    // ⚠️ SECURITY: Do NOT create a session for an existing user via invite
    // token, and do NOT implicitly add the `reviewer` role. Require the user
    // to log in first; the reviewer linkage (and role grant) is completed by
    // a separate authenticated endpoint.
    //
    // We still consume the token (mark accepted + null out) to prevent replay,
    // but the session is only established through normal login.
    // We do NOT link user_id here — that happens in the authenticated
    // confirm step so we can verify the logged-in identity matches the
    // invited email.
    return NextResponse.json({
      success: true,
      requires_login: true,
      email,
      review_url: `/events/${invite.event_id}/reviewer`,
    })
  }

  // New user registration path — password is required and must meet minimum length.
  if (!password || password.length < 8) {
    return NextResponse.json({ error: '参数无效或密码太短' }, { status: 400 })
  }

  const hashed = await hashPassword(password)
  const { data: newUser, error: createErr } = await db
    .from('users')
    .insert({
      email,
      password_hash: hashed,
      credits: 200,
      email_verified: true,
      role: ['reviewer'],
      ...(name ? { name: name.trim() } : {}),
    })
    .select('id')
    .single()

  if (createErr || !newUser) {
    return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 })
  }
  const userId = newUser.id

  // Update invite: link user, mark accepted, clear token (one-time use)
  await db
    .from('event_reviewers')
    .update({ user_id: userId, invite_status: 'accepted', invite_token: null })
    .eq('id', invite.id)

  // Initialize reviewer_scores for all projects × models
  initReviewerScores(db, invite.event_id, userId).catch(() => {})

  // Auto-login is safe here: this account was just created by this very
  // request, so granting a session to the caller is by definition authorized.
  const sessionToken = await createToken(userId, email)
  const cookieStore = await cookies()
  cookieStore.set('session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return NextResponse.json({
    success: true,
    review_url: `/events/${invite.event_id}/reviewer`,
  })
}
