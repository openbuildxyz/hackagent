/**
 * Lightweight IP-level rate limiter for public API routes.
 *
 * Strategy:
 * - If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, use Upstash
 *   Redis REST (fixed-window counter with INCR + EXPIRE). Works on Vercel edge.
 * - Otherwise fall back to an in-memory Map keyed by `${bucket}:${key}:${window}`.
 *   Fine for single-instance / dev; on Vercel serverless it's best-effort per
 *   lambda but still blocks trivial single-IP floods.
 *
 * Fixed-window algorithm is intentional — simpler than sliding window, no Lua
 * script needed, and for 1-minute windows the precision is good enough for L1
 * anti-scrape.
 */
export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number // unix ms when the current window ends
  retryAfter: number // seconds until reset (only meaningful when !allowed)
}

// Accept either the native Upstash env names or the Vercel marketplace
// auto-injected ones (KV_REST_API_*). When Ian installs "Upstash for Redis"
// from `vercel integration add upstash/upstash-kv`, Vercel injects KV_REST_API_*
// automatically — no manual env management needed.
const UPSTASH_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
const UPSTASH_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

// In-memory fallback store. Map<bucketKey, { count, resetAt }>
type MemEntry = { count: number; resetAt: number }
const memStore = new Map<string, MemEntry>()

function memCheck(
  bucketKey: string,
  limit: number,
  windowMs: number,
  peek = false
): RateLimitResult {
  const now = Date.now()
  let entry = memStore.get(bucketKey)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs }
    memStore.set(bucketKey, entry)
  }
  if (!peek) entry.count++
  // Opportunistic cleanup: if the map gets big, drop expired entries.
  if (memStore.size > 10000) {
    for (const [k, v] of memStore) {
      if (v.resetAt <= now) memStore.delete(k)
    }
  }
  const remaining = Math.max(0, limit - entry.count)
  const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
  return {
    allowed: entry.count <= limit,
    limit,
    remaining,
    resetAt: entry.resetAt,
    retryAfter,
  }
}

async function upstashCheck(
  bucketKey: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    // Shouldn't happen — caller checks. Fall back to memory.
    return memCheck(bucketKey, limit, windowSec * 1000)
  }
  const now = Date.now()
  // Quantize the key into discrete windows so the counter auto-resets.
  const windowStart = Math.floor(now / (windowSec * 1000)) * windowSec * 1000
  const resetAt = windowStart + windowSec * 1000
  const redisKey = `rl:${bucketKey}:${windowStart}`

  try {
    // Pipeline: INCR then EXPIRE (only first hit really needs EXPIRE but it's cheap).
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['EXPIRE', redisKey, String(windowSec + 5)],
      ]),
      // Keep it snappy — if Redis is slow, fail open rather than block requests.
      signal: AbortSignal.timeout(500),
    })
    if (!res.ok) throw new Error(`upstash ${res.status}`)
    const data = (await res.json()) as Array<{ result: number | string }>
    const count = Number(data[0]?.result ?? 0)
    const remaining = Math.max(0, limit - count)
    const retryAfter = Math.ceil((resetAt - now) / 1000)
    return {
      allowed: count <= limit,
      limit,
      remaining,
      resetAt,
      retryAfter,
    }
  } catch {
    // Fail open: don't take the site down because Redis hiccups.
    return memCheck(bucketKey, limit, windowSec * 1000)
  }
}

export async function rateLimit(opts: {
  bucket: string // logical bucket, e.g. "public-anon"
  key: string // identity, e.g. ip or user id
  limit: number // max requests per window
  windowSec: number // window size in seconds
  peek?: boolean // if true, check the counter without incrementing
}): Promise<RateLimitResult> {
  const bucketKey = `${opts.bucket}:${opts.key}`
  if (opts.peek) {
    // Peek path: memory store only. For Upstash we'd need GET; keeping it
    // simple — peek is a best-effort pre-check used by auth flows before the
    // real failure-only increment. Worst case it returns "allowed" when the
    // real counter is full, and the subsequent increment on failure will 429.
    return memCheck(bucketKey, opts.limit, opts.windowSec * 1000, true)
  }
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    return upstashCheck(bucketKey, opts.limit, opts.windowSec)
  }
  return memCheck(bucketKey, opts.limit, opts.windowSec * 1000)
}

/**
 * Reset a rate-limit counter. Used by auth flows to clear the bucket after a
 * successful login, so legitimate users aren't penalized for earlier typos.
 * Best-effort: failures are swallowed (we don't want to block the hot path).
 */
export async function rateLimitReset(opts: { bucket: string; key: string; windowSec: number }): Promise<void> {
  const bucketKey = `${opts.bucket}:${opts.key}`
  memStore.delete(bucketKey)
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const now = Date.now()
    const windowStart = Math.floor(now / (opts.windowSec * 1000)) * opts.windowSec * 1000
    const redisKey = `rl:${bucketKey}:${windowStart}`
    try {
      await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(redisKey)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        signal: AbortSignal.timeout(500),
      })
    } catch {
      // swallow — reset is best-effort
    }
  }
}

export function getClientIp(req: Request): string {
  // Vercel sets x-forwarded-for; take the first (original client) entry.
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri.trim()
  // Next 15 exposes req.ip on NextRequest but not on the edge Request type;
  // fall back to a stable sentinel so everyone shares a bucket (still limited).
  return 'unknown'
}

export function hasAuthSignal(req: Request): boolean {
  // Treat any of: x-api-key header, Authorization bearer, or sb- auth cookie
  // as "authenticated-ish" → higher bucket. Cheap heuristic, we don't verify
  // the token here (that's the route's job).
  if (req.headers.get('x-api-key')) return true
  const auth = req.headers.get('authorization')
  if (auth && /^Bearer\s+\S+/i.test(auth)) return true
  const cookie = req.headers.get('cookie') || ''
  if (/sb-[^=]*-auth-token=/.test(cookie)) return true
  return false
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  const h: Record<string, string> = {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.floor(r.resetAt / 1000)),
  }
  if (!r.allowed) h['Retry-After'] = String(r.retryAfter)
  return h
}
