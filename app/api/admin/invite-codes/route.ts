import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'
import { recordAdminAction } from '@/lib/admin-audit'

const MAX_CREATE_COUNT = 20

function generateInviteCode(): string {
  return `HA-${crypto.randomBytes(5).toString('hex').toUpperCase()}`
}

export async function GET() {
  const session = await getSessionUserWithRole()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('invite_codes')
    .select('id, code, used_by, used_at, created_at, event_id, role')
    .is('event_id', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const session = await getSessionUserWithRole()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { count?: number }
  const count = Math.min(Math.max(Number(body.count) || 1, 1), MAX_CREATE_COUNT)
  const db = createServiceClient()

  let inserted: Array<{ id: string; code: string; created_at: string; role: string | null }> = []
  for (let attempt = 0; inserted.length < count && attempt < count * 3; attempt++) {
    const code = generateInviteCode()
    const { data, error } = await db
      .from('invite_codes')
      .insert({ code, role: 'admin', event_id: null })
      .select('id, code, created_at, role')
      .single()

    if (error) {
      if (/duplicate|unique/i.test(error.message)) continue
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (data) inserted = [...inserted, data]
  }

  if (inserted.length === 0) {
    return NextResponse.json({ error: 'Failed to generate invite codes' }, { status: 500 })
  }

  await recordAdminAction({
    adminUserId: session.userId,
    action: 'invite_code.create',
    target_type: 'invite_code',
    target_id: inserted[0].id,
    after: { count: inserted.length, codes: inserted.map((item) => item.code) },
  })

  return NextResponse.json(inserted, { status: 201 })
}
