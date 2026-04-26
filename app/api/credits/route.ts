import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

export async function GET() {
  try {
    const session = await getSessionUser()
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const db = createServiceClient()
    const { data: user, error } = await db
      .from('users')
      .select('credits')
      .eq('id', session.userId)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 })
    }

    return NextResponse.json({ credits: user.credits ?? 0 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
