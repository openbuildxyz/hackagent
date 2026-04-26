import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { hashPassword } from '@/lib/auth'

// POST /api/auth/reset-password
export async function POST(request: NextRequest) {
  const { token, password } = await request.json()
  if (!token || !password) return NextResponse.json({ error: '参数缺失' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 })

  const db = createServiceClient()
  const { data: user } = await db
    .from('users')
    .select('id, reset_token, reset_expires_at')
    .eq('reset_token', token)
    .single()

  if (!user) return NextResponse.json({ error: '链接无效或已过期' }, { status: 400 })
  if (new Date(user.reset_expires_at) < new Date()) {
    return NextResponse.json({ error: '链接已过期，请重新申请' }, { status: 400 })
  }

  const passwordHash = await hashPassword(password)
  await db.from('users').update({
    password_hash: passwordHash,
    reset_token: null,
    reset_expires_at: null,
  }).eq('id', user.id)

  return NextResponse.json({ success: true })
}
