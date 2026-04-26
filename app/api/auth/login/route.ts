import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyPassword, createToken } from '@/lib/auth'
import { rateLimit, rateLimitReset, getClientIp, rateLimitHeaders } from '@/lib/ratelimit'

// Two-dimensional brute-force protection:
// - Per-email: 5 failed attempts / 5min  (stops targeted cracking)
// - Per-IP:    20 failed attempts / 5min (stops low-and-slow across many emails
//              from one source; distributed attackers still need many IPs)
// Counters only advance on *failed* auth, so a legit user who mistypes then
// gets it right keeps working. Successful login also resets the email bucket.
const EMAIL_BUCKET = 'auth-login-email'
const IP_BUCKET = 'auth-login-ip'
const EMAIL_LIMIT = 5
const IP_LIMIT = 20
const WINDOW_SEC = 300

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'MISSING_CREDENTIALS' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const ip = getClientIp(request)

  // Pre-check (peek, no increment) — reject early before doing DB + bcrypt.
  // This also prevents the login endpoint from being used as a CPU DoS via
  // forced bcrypt comparisons.
  const emailPeek = await rateLimit({
    bucket: EMAIL_BUCKET,
    key: normalizedEmail,
    limit: EMAIL_LIMIT,
    windowSec: WINDOW_SEC,
    peek: true,
  })
  if (!emailPeek.allowed) {
    return NextResponse.json(
      { error: 'TOO_MANY_ATTEMPTS' },
      { status: 429, headers: rateLimitHeaders(emailPeek) }
    )
  }

  const ipPeek = await rateLimit({
    bucket: IP_BUCKET,
    key: ip,
    limit: IP_LIMIT,
    windowSec: WINDOW_SEC,
    peek: true,
  })
  if (!ipPeek.allowed) {
    return NextResponse.json(
      { error: 'TOO_MANY_ATTEMPTS' },
      { status: 429, headers: rateLimitHeaders(ipPeek) }
    )
  }

  const db = createServiceClient()

  const { data: user } = await db
    .from('users')
    .select('id, email, password_hash, email_verified')
    .eq('email', normalizedEmail)
    .single()

  // Helper — any auth failure path goes through here so the two counters
  // stay in sync and we respond with 429 the instant a bucket fills up.
  const recordFailure = async (errorCode: string) => {
    const [emailRl, ipRl] = await Promise.all([
      rateLimit({ bucket: EMAIL_BUCKET, key: normalizedEmail, limit: EMAIL_LIMIT, windowSec: WINDOW_SEC }),
      rateLimit({ bucket: IP_BUCKET, key: ip, limit: IP_LIMIT, windowSec: WINDOW_SEC }),
    ])
    // Pick the tighter bucket for the response headers; if either one just
    // exceeded its limit, return 429 instead of 401.
    const blocked = !emailRl.allowed ? emailRl : !ipRl.allowed ? ipRl : null
    if (blocked) {
      return NextResponse.json(
        { error: 'TOO_MANY_ATTEMPTS' },
        { status: 429, headers: rateLimitHeaders(blocked) }
      )
    }
    // Still under the limit — surface remaining quota so clients/tests can see it.
    return NextResponse.json(
      { error: errorCode },
      { status: 401, headers: rateLimitHeaders(emailRl) }
    )
  }

  if (!user) {
    return recordFailure('INVALID_CREDENTIALS')
  }

  if (!user.email_verified) {
    return recordFailure('EMAIL_NOT_VERIFIED')
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    return recordFailure('INVALID_CREDENTIALS')
  }

  // Success — clear the email bucket so earlier typos don't leave the account
  // partially throttled. IP bucket stays (it's aggregated across accounts).
  await rateLimitReset({ bucket: EMAIL_BUCKET, key: normalizedEmail, windowSec: WINDOW_SEC })

  const token = await createToken(user.id, user.email)

  const response = NextResponse.json({ success: true })
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })

  return response
}
