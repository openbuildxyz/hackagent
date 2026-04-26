import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendPasswordResetEmail } from '@/lib/mail'
import { rateLimit, getClientIp } from '@/lib/ratelimit'

// POST /api/auth/forgot-password
//
// Security:
//   • Response is always `{ success: true }` (except for explicit 400 on
//     malformed input) to preserve anti-enumeration semantics.
//   • Per-email rate limit: 3 requests / hour. Stops an attacker from
//     flooding a victim's inbox or rotating a live reset_token out from
//     under a real user mid-flow.
//   • Per-IP rate limit: 10 requests / hour across all emails. Defense
//     in depth against scripted multi-email spam from one source.
//   • Token reuse window: if we already issued a token <60s ago and it
//     hasn't expired, reuse it instead of sending a second email. Handles
//     user-initiated double-clicks without punishing them.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown }
  const rawEmail = typeof body.email === 'string' ? body.email : ''
  if (!rawEmail) return NextResponse.json({ error: '请输入邮箱' }, { status: 400 })

  const normalizedEmail = rawEmail.toLowerCase().trim()
  if (!normalizedEmail) return NextResponse.json({ error: '请输入邮箱' }, { status: 400 })

  // Constant-success response used for every non-400 branch below.
  const ok = () => NextResponse.json({ success: true })

  // --- Rate limit by email (primary guard against inbox flooding) ---
  const emailRl = await rateLimit({
    bucket: 'auth-forgot-email',
    key: normalizedEmail,
    limit: 3,
    windowSec: 3600,
  })
  if (!emailRl.allowed) return ok()

  // --- Rate limit by IP (defense in depth vs multi-email sprays) ---
  const ipRl = await rateLimit({
    bucket: 'auth-forgot-ip',
    key: getClientIp(request),
    limit: 10,
    windowSec: 3600,
  })
  if (!ipRl.allowed) return ok()

  const db = createServiceClient()
  const { data: user } = await db
    .from('users')
    .select('id, email, reset_token, reset_expires_at, reset_issued_at')
    .eq('email', normalizedEmail)
    .single()

  // Anti-enumeration: same 200 whether or not the email exists.
  if (!user) return ok()

  const now = Date.now()
  const existingExpiresAt = user.reset_expires_at
    ? new Date(user.reset_expires_at).getTime()
    : 0
  const existingIssuedAt = user.reset_issued_at
    ? new Date(user.reset_issued_at).getTime()
    : 0

  // Reuse window: if we issued a token <60s ago and it's still valid,
  // don't rotate it and don't resend the email. This both saves the user
  // from duplicate mail on double-clicks AND removes the attacker's
  // ability to rapidly invalidate a live reset link.
  const tokenIsLive = user.reset_token && existingExpiresAt > now
  const issuedRecently = existingIssuedAt > now - 60 * 1000
  if (tokenIsLive && issuedRecently) return ok()

  const token = crypto.randomUUID()
  const expiresAt = new Date(now + 60 * 60 * 1000).toISOString() // 1h
  const issuedAt = new Date(now).toISOString()

  await db
    .from('users')
    .update({
      reset_token: token,
      reset_expires_at: expiresAt,
      reset_issued_at: issuedAt,
    })
    .eq('id', user.id)

  await sendPasswordResetEmail(user.email, token)

  return ok()
}
