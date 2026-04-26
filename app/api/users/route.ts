import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserWithRole } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/ratelimit'

// GET /api/users?email=xxx — look up a user by email for the reviewer-invite
// flow. Restricted to organizers/admins because exposing this to any logged-in
// user allowed arbitrary email enumeration across the whole user table.
// Additionally rate-limited per caller to stop a malicious organizer from
// dumping the user list.
export async function GET(request: NextRequest) {
  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const canLookup =
    session.isAdmin ||
    session.role.includes('organizer') ||
    session.role.includes('super_admin')
  if (!canLookup) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rl = await rateLimit({
    bucket: 'users-email-lookup',
    key: `${session.userId}:${getClientIp(request)}`,
    limit: 30,
    windowSec: 300,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }

  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')?.trim().toLowerCase()

  if (!email) {
    return NextResponse.json({ error: 'email 参数不能为空' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: user } = await db
    .from('users')
    .select('id, email')
    .eq('email', email)
    .single()

  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 })
  }

  return NextResponse.json({ id: user.id, email: user.email })
}
