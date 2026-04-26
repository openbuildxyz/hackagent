import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { initReviewerScores } from '@/app/api/events/[eventId]/reviewers/route'

// POST /api/reviewer-invite/confirm — finalize invite for an already-registered
// user. Requires the caller to be logged in AND their session email to match
// the invite's target email. Only then do we:
//   1) Link the invite row to this user
//   2) Mark invite accepted + clear the one-time token
//   3) Grant the `reviewer` role (idempotent)
//
// This is the authenticated counterpart to /accept. The unauthenticated
// /accept endpoint refuses to sign sessions / grant roles for existing users
// to prevent account takeover via leaked invite tokens (see OPE-40).
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { token } = await req.json() as { token: string }
  if (!token) return NextResponse.json({ error: '参数无效' }, { status: 400 })

  const db = createServiceClient()

  const { data: invite } = await db
    .from('event_reviewers')
    .select('id, invite_email, invite_status, event_id, user_id')
    .eq('invite_token', token)
    .single()

  if (!invite) return NextResponse.json({ error: '邀请链接无效或已过期' }, { status: 404 })
  if (invite.invite_status === 'accepted') return NextResponse.json({ error: '该邀请已使用' }, { status: 409 })

  // Verify logged-in user matches invite email (case-insensitive)
  if ((invite.invite_email ?? '').toLowerCase() !== (session.email ?? '').toLowerCase()) {
    return NextResponse.json({ error: '该邀请不属于当前登录账号' }, { status: 403 })
  }

  // Grant reviewer role if missing
  const { data: existingRole } = await db
    .from('users')
    .select('role')
    .eq('id', session.userId)
    .single()
  const roles: string[] = Array.isArray(existingRole?.role) ? (existingRole!.role as string[]) : []
  if (!roles.includes('reviewer')) {
    await db.from('users').update({ role: [...roles, 'reviewer'] }).eq('id', session.userId)
  }

  // Link invite + consume one-time token
  await db
    .from('event_reviewers')
    .update({ user_id: session.userId, invite_status: 'accepted', invite_token: null })
    .eq('id', invite.id)

  initReviewerScores(db, invite.event_id, session.userId).catch(() => {})

  return NextResponse.json({
    success: true,
    review_url: `/events/${invite.event_id}/reviewer`,
  })
}
