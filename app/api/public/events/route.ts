import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/ratelimit'

// 60 req/min/IP — ample for a normal browser paint + a few client retries,
// tight enough to block scripted scraping of the full event catalogue.
export async function GET(request: NextRequest) {
  const rl = await rateLimit({
    bucket: 'public-events-list',
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

  const db = createServiceClient()
  const { data: events, error } = await db
    .from('events')
    .select('id, name, description, banner_url, status, created_at, tracks, registration_config, registration_deadline')
    .is('deleted_at', null)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .neq('status', 'draft')
    .neq('status', 'cancelled')
    .not('name', 'ilike', '%test%')
    .not('name', 'ilike', '%qa%')
    .not('name', 'ilike', '%e2e%')
    .not('name', 'ilike', '%ope-%')
    .not('name', 'ilike', '%测试%')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(events, { headers: rateLimitHeaders(rl) })
}
