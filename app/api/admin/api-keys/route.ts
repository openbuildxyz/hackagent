import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

// OPE-25: admin-only — list API keys across all users (for audit)
export async function GET() {
  const session = await getSessionUserWithRole()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('api_keys')
    .select('id, user_id, name, key_prefix, created_at, last_used_at, revoked_at, users(email)')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
