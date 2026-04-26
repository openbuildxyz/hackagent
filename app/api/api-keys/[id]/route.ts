import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

// DELETE — 撤销（revoke）API key，标记 revoked_at，不物理删除
// OPE-27: 修复越权删除 — 非 owner（且非 admin）返回 403 而不是虚假 success。
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const db = createServiceClient()

  let q = db
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
  if (!session.isAdmin) {
    q = q.eq('user_id', session.userId)
  }
  const { data, error } = await q.select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    // 不存在 / 已撤销 / 非 owner —— 统一 403（admin 情况下真不存在也 403 可接受）
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ success: true })
}
