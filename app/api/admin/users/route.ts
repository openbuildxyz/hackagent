import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/session'

const ROLES = ['admin', 'organizer', 'reviewer', 'viewer']

async function requireAdmin() {
  const session = await getSessionUser()
  if (!session) return null
  const db = createServiceClient()
  const { data: user } = await db.from('users').select('role').eq('id', session.userId).single()
  if (!user?.role?.includes('admin')) return null
  return session
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = createServiceClient()
  const { data, error } = await db
    .from('users')
    .select('id, email, role, credits, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, role } = await request.json()
  if (!userId || !Array.isArray(role)) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  if (role.some((r: string) => !ROLES.includes(r))) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  const db = createServiceClient()
  const beforeRes = await db.from('users').select('role').eq('id', userId).maybeSingle()
  const { error } = await db.from('users').update({ role }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // OPE-25: audit
  await import('@/lib/admin-audit').then(m => m.recordAdminAction({
    adminUserId: session.userId,
    action: 'user.role.change',
    target_type: 'user',
    target_id: userId,
    before: beforeRes.data ? { role: beforeRes.data.role } : null,
    after: { role },
  }))

  return NextResponse.json({ ok: true })
}
