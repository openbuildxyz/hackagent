import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hashPassword } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/mail'
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/ratelimit'

// Strict email regex — rejects XSS payloads and malformed addresses
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

// Per-IP register rate limit — 5 attempts / hour. Stops a single source from
// burning invite codes or probing for registered emails via the 400 response
// shape. Real users finish sign-up in one shot; 5/hr leaves plenty of room.
const IP_BUCKET = 'auth-register-ip'
const IP_LIMIT = 5
const WINDOW_SEC = 3600

export async function POST(request: NextRequest) {
  const ipRl = await rateLimit({
    bucket: IP_BUCKET,
    key: getClientIp(request),
    limit: IP_LIMIT,
    windowSec: WINDOW_SEC,
  })
  if (!ipRl.allowed) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: rateLimitHeaders(ipRl) }
    )
  }

  let body: { email?: string; password?: string; name?: string; invite_code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const { email, password, name, invite_code } = body

  // ── Validation ──────────────────────────────────────────
  if (!email || !password) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 })
  }

  const normalizedEmail = email.trim().toLowerCase()

  // Email format (also rejects XSS payloads like <script>...)
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
  }

  // Password length
  if (password.length < 8) {
    return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 })
  }

  // Invite code — required and non-empty
  const trimmedCode = (invite_code ?? '').trim()
  if (!trimmedCode) {
    return NextResponse.json({ error: '邀请码必填' }, { status: 400 })
  }
  // ────────────────────────────────────────────────────────

  const db = createServiceClient()

  // Validate invite code
  const { data: codeRow } = await db
    .from('invite_codes')
    .select('id, used_by')
    .eq('code', trimmedCode)
    .single()

  if (!codeRow) {
    return NextResponse.json({ error: '邀请码无效' }, { status: 400 })
  }
  if (codeRow.used_by) {
    return NextResponse.json({ error: '邀请码已被使用' }, { status: 400 })
  }

  // Check email not already registered
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('email', normalizedEmail)
    .single()

  if (existing) {
    return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 })
  }

  const passwordHash = await hashPassword(password)
  const verifyToken = crypto.randomUUID()
  const verifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  // Insert user
  const { data: newUser, error: insertError } = await db
    .from('users')
    .insert({
      email: normalizedEmail,
      password_hash: passwordHash,
      verify_token: verifyToken,
      verify_expires_at: verifyExpiresAt,
      ...(name ? { name: name.trim() } : {}),
    })
    .select('id')
    .single()

  if (insertError || !newUser) {
    return NextResponse.json({ error: '注册失败，请重试' }, { status: 500 })
  }

  // Mark invite code as used
  await db
    .from('invite_codes')
    .update({ used_by: newUser.id, used_at: new Date().toISOString() })
    .eq('id', codeRow.id)

  // Send verification email
  await sendVerificationEmail(normalizedEmail, verifyToken)

  return NextResponse.json({ success: true, message: '验证邮件已发送' })
}
