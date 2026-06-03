import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/session'
import { recordAdminAction } from '@/lib/admin-audit'

const ROLES = ['admin', 'organizer', 'reviewer', 'viewer']
const MAX_REASON_LENGTH = 500

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

  const body = await request.json()
  const { userId, role, action, amount, reason } = body
  if (!userId || typeof userId !== 'string') return NextResponse.json({ error: 'Invalid params' }, { status: 400 })

  const db = createServiceClient()

  if (action === 'credits.adjust') {
    const parsedAmount = typeof amount === 'number' ? amount : Number(amount)
    const trimmedReason = typeof reason === 'string' ? reason.trim() : ''

    if (!Number.isInteger(parsedAmount) || parsedAmount === 0) {
      return NextResponse.json({ error: 'Credit adjustment must be a non-zero integer' }, { status: 400 })
    }
    if (trimmedReason.length > MAX_REASON_LENGTH) {
      return NextResponse.json({ error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer` }, { status: 400 })
    }

    const beforeRes = await db.from('users').select('credits').eq('id', userId).maybeSingle()
    if (beforeRes.error) return NextResponse.json({ error: beforeRes.error.message }, { status: 500 })
    if (!beforeRes.data) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const beforeCredits = beforeRes.data.credits ?? 0
    const afterCredits = beforeCredits + parsedAmount
    if (afterCredits < 0) {
      return NextResponse.json({ error: 'Credit adjustment would make the balance negative' }, { status: 400 })
    }

    const { data: updated, error } = await db
      .from('users')
      .update({ credits: afterCredits })
      .eq('id', userId)
      .eq('credits', beforeCredits)
      .select('credits')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated) return NextResponse.json({ error: 'Credits changed while saving. Refresh and try again.' }, { status: 409 })

    await recordAdminAction({
      adminUserId: session.userId,
      action: 'user.credits.adjust',
      target_type: 'user',
      target_id: userId,
      before: { credits: beforeCredits },
      after: { credits: updated.credits },
      metadata: {
        amount: parsedAmount,
        reason: trimmedReason || null,
      },
    })

    return NextResponse.json({
      ok: true,
      credits: updated.credits,
      beforeCredits,
      afterCredits: updated.credits,
    })
  }

  if (!Array.isArray(role)) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  if (role.some((r: string) => !ROLES.includes(r))) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  const beforeRes = await db.from('users').select('role').eq('id', userId).maybeSingle()
  const { error } = await db.from('users').update({ role }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // OPE-25: audit
  await recordAdminAction({
    adminUserId: session.userId,
    action: 'user.role.change',
    target_type: 'user',
    target_id: userId,
    before: beforeRes.data ? { role: beforeRes.data.role } : null,
    after: { role },
  })

  return NextResponse.json({ ok: true })
}
