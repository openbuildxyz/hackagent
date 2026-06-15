import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { isPlatformAdmin, normalizeRoles } from '@/lib/permissions'

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
  const role = normalizeRoles(data?.role)
  return {
    ...session,
    role,
    isAdmin: isPlatformAdmin(role),
  }
}
