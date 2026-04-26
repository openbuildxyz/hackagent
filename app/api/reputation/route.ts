import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

// GET /api/reputation          — own reputation (requires auth)
// GET /api/reputation?email=x  — only allowed if x === session user's email
//
// Note: anonymous lookup by email was removed (OPE-31) to prevent email
// enumeration and competitor profiling.
export async function GET(request: NextRequest) {
  const db = createServiceClient()
  const { searchParams } = request.nextUrl
  const emailParam = searchParams.get('email')?.trim().toLowerCase() || null

  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: user } = await db
    .from('users')
    .select('email')
    .eq('id', session.userId)
    .single()

  const sessionEmail = user?.email?.toLowerCase() ?? null
  if (!sessionEmail) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  if (emailParam && emailParam !== sessionEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const email = sessionEmail

  const { data, error } = await db
    .from('developer_reputation')
    .select('email, hackathon_count, completion_rate, avg_score, top_score, last_active')
    .eq('email', email)
    .single()

  if (error || !data) {
    // Return empty reputation for new users
    return NextResponse.json({
      email,
      hackathon_count: 0,
      completion_rate: 0,
      avg_score: 0,
      top_score: 0,
      last_active: null,
      message: 'No reputation data yet. Participate in a hackathon to build yours.',
    })
  }

  return NextResponse.json(data)
}
