import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

// OPE-25: admin-only — read admin audit log
export async function GET(request: Request) {
  const session = await getSessionUserWithRole()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)
  const target_type = url.searchParams.get('target_type')
  const target_id = url.searchParams.get('target_id')
  const admin_user_id = url.searchParams.get('admin_user_id')

  const db = createServiceClient()
  let q = db
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (target_type) q = q.eq('target_type', target_type)
  if (target_id) q = q.eq('target_id', target_id)
  if (admin_user_id) q = q.eq('admin_user_id', admin_user_id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
