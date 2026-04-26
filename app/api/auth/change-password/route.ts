import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { hashPassword, verifyPassword } from '@/lib/auth'

// POST /api/auth/change-password
export async function POST(request: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { oldPassword, newPassword } = await request.json()
  if (!oldPassword || !newPassword) return NextResponse.json({ error: '参数缺失' }, { status: 400 })
  if (newPassword.length < 8) return NextResponse.json({ error: '新密码至少 8 位' }, { status: 400 })

  const db = createServiceClient()
  const { data: user } = await db
    .from('users')
    .select('id, password_hash')
    .eq('id', session.userId)
    .single()

  if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 })

  const valid = await verifyPassword(oldPassword, user.password_hash)
  if (!valid) return NextResponse.json({ error: '旧密码不正确' }, { status: 400 })

  const passwordHash = await hashPassword(newPassword)
  await db.from('users').update({ password_hash: passwordHash }).eq('id', user.id)

  return NextResponse.json({ success: true })
}
