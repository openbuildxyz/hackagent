import { NextRequest, NextResponse } from 'next/server'
import { getClientIp, hasAuthSignal, rateLimit, rateLimitHeaders } from '@/lib/ratelimit'

/**
 * Rate-limit public API surfaces. Keep this lightweight: only pattern-match on
 * pathname, do the Redis/mem check, and pass through. No DB, no auth lookups.
 *
 * Buckets:
 *   - anon   → 60 req/min per IP (matches OPE-24 L1 spec)
 *   - authed → 300 req/min per identity (API key / Supabase auth cookie)
 *
 * We intentionally do NOT rate-limit admin endpoints here — those already
 * require auth and have small audiences; a broken limiter would lock out ops.
 */

const WINDOW_SEC = 60
const ANON_LIMIT = 60
const AUTHED_LIMIT = 300

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Guard clause — matcher below already filters, but be defensive.
  // Covered surfaces (OPE-24 L1 + OPE-72 复测扩展):
  //   - /api/public/*            纯匿名公开
  //   - /api/v1/events*          开放式 v1 API (含 skill.md 工具链)
  //   - /api/events*             授权后的 events 列表/详情/子路由（OPE-72）
  //   - /api/public-stats        匿名聚合统计
  //   - /api/a2a                 agent-to-agent 协议入口
  //   - /api/agent/register      匿名 agent 注册
  const isPublicApi =
    pathname.startsWith('/api/public/') ||
    pathname === '/api/v1/events' ||
    pathname.startsWith('/api/v1/events/') ||
    pathname === '/api/events' ||
    pathname.startsWith('/api/events/') ||
    pathname === '/api/public-stats' ||
    pathname === '/api/a2a' ||
    pathname === '/api/agent/register'
  if (!isPublicApi) return NextResponse.next()

  const authed = hasAuthSignal(req)
  const limit = authed ? AUTHED_LIMIT : ANON_LIMIT
  const bucket = authed ? 'authed' : 'anon'

  // Identity key: for authed requests prefer the api key or bearer token
  // (first 32 chars — plenty for bucketing, never logged) so one user behind a
  // shared NAT doesn't share quota with anon IPs. Anon requests key on IP.
  let key = getClientIp(req)
  if (authed) {
    const apiKey = req.headers.get('x-api-key')
    const auth = req.headers.get('authorization')
    const token = apiKey || auth?.replace(/^Bearer\s+/i, '') || key
    key = `k:${token.slice(0, 32)}`
  }

  const result = await rateLimit({ bucket, key, limit, windowSec: WINDOW_SEC })
  const headers = rateLimitHeaders(result)

  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', retry_after: result.retryAfter },
      { status: 429, headers }
    )
  }

  const res = NextResponse.next()
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
  return res
}

export const config = {
  matcher: [
    '/api/public/:path*',
    '/api/v1/events',
    '/api/v1/events/:path*',
    '/api/events',
    '/api/events/:path*',
    '/api/public-stats',
    '/api/a2a',
    '/api/agent/register',
  ],
}
