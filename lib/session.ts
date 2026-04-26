import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function getSessionUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return null
  return verifyToken(token)
}

/**
 * getSessionUserWithRole — session + users.role (text[])
 * Used by endpoints that need admin bypass (OPE-25) without bloating JWT.
 * DB round-trip is small; consider caching per-request if hot-pathed.
 */
export async function getSessionUserWithRole(): Promise<
  { userId: string; email: string; role: string[]; isAdmin: boolean } | null
> {
  const session = await getSessionUser()
  if (!session) return null
  const db = createServiceClient()
  const { data } = await db
    .from('users')
    .select('role')
    .eq('id', session.userId)
    .maybeSingle()
  const role: string[] = Array.isArray(data?.role)
    ? (data!.role as string[])
    : data?.role
      ? [String(data.role)]
      : []
  return {
    ...session,
    role,
    isAdmin: role.includes('admin'),
  }
}
