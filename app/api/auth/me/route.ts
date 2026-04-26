import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ loggedIn: false })

  const db = createServiceClient()
  const { data: user } = await db
    .from('users')
    .select('email, credits, role')
    .eq('id', session.userId)
    .single()

  const role: string[] = Array.isArray(user?.role)
    ? user.role
    : user?.role
      ? [user.role as string]
      : ['viewer']

  return NextResponse.json({
    loggedIn: true,
    userId: session.userId,
    email: user?.email ?? null,
    credits: user?.credits ?? 0,
    role,
  })
}
