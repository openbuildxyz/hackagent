import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendVerificationEmail } from '@/lib/mail'
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/ratelimit'

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

function ok() {
  return NextResponse.json({ success: true })
}

function domainOf(email: string) {
  return email.includes('@') ? email.split('@').pop()?.toLowerCase() ?? 'unknown' : 'unknown'
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) {
    return NextResponse.json({ error: '请输入邮箱' }, { status: 400 })
  }
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
  }

  const emailRl = await rateLimit({
    bucket: 'auth-resend-verification-email',
    key: email,
    limit: 3,
    windowSec: 3600,
  })
  if (!emailRl.allowed) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: rateLimitHeaders(emailRl) }
    )
  }

  const ipRl = await rateLimit({
    bucket: 'auth-resend-verification-ip',
    key: getClientIp(request),
    limit: 10,
    windowSec: 3600,
  })
  if (!ipRl.allowed) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: rateLimitHeaders(ipRl) }
    )
  }

  const db = createServiceClient()
  const { data: user } = await db
    .from('users')
    .select('id, email, email_verified, verify_token, verify_expires_at')
    .eq('email', email)
    .maybeSingle()

  if (!user || user.email_verified) return ok()

  const now = Date.now()
  const tokenIsLive = user.verify_token && user.verify_expires_at && new Date(user.verify_expires_at).getTime() > now
  const token = tokenIsLive ? user.verify_token : crypto.randomUUID()

  if (!tokenIsLive) {
    const { error } = await db
      .from('users')
      .update({
        verify_token: token,
        verify_expires_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', user.id)
    if (error) {
      console.error('[auth.resendVerification] token update failed', {
        recipient_domain: domainOf(email),
        error: error.message,
      })
      return NextResponse.json({ error: '发送失败，请稍后重试' }, { status: 500 })
    }
  }

  try {
    await sendVerificationEmail(user.email, token)
  } catch (error) {
    console.error('[auth.resendVerification] mail failed', {
      recipient_domain: domainOf(email),
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: '发送失败，请稍后重试' }, { status: 500 })
  }

  return ok()
}
