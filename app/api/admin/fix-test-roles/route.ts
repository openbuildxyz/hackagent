import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/session'

const ROLES = ['admin', 'organizer', 'reviewer', 'viewer'] as const
type Role = typeof ROLES[number]

// Test-only utility: lets an admin reset a test account's role so permission
// boundaries can actually be exercised in non-prod. Disabled in production.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Forbidden: not available in production' }, { status: 403 })
  }

  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()
  const { data: caller } = await db.from('users').select('role').eq('id', session.userId).maybeSingle()
  if (!caller?.role?.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
  }

  const { userId, role } = await req.json().catch(() => ({}))
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Invalid params: userId required' }, { status: 400 })
  }
  if (!role || !ROLES.includes(role as Role)) {
    return NextResponse.json({ error: `Invalid role: must be one of ${ROLES.join(', ')}` }, { status: 400 })
  }

  const { data, error } = await db
    .from('users')
    .update({ role: [role] })
    .eq('id', userId)
    .select('id, email, role')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
