import { verifyApiKey } from '@/lib/apikey'
import { verifyToken } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

/**
 * 从 Request 中提取 Bearer token 或 session cookie，返回 userId 和 role[]
 * 优先级：Authorization: Bearer <api_key> > Cookie: session=<jwt>
 */
export async function getAgentUser(
  req: Request
): Promise<{ userId: string; role: string[] } | null> {
  // 1. 尝试 Bearer token（API key）
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    const user = await verifyApiKey(token)
    if (user) return { userId: user.id, role: user.role }
    return null
  }

  // 2. 尝试 session cookie（JWT）
  const cookieHeader = req.headers.get('cookie') ?? ''
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/)
  if (sessionMatch) {
    const jwtToken = sessionMatch[1]
    const session = await verifyToken(jwtToken)
    if (session) {
      const db = createServiceClient()
      const { data: user } = await db
        .from('users')
        .select('id, role')
        .eq('id', session.userId)
        .single()
      if (user) {
        const role: string[] = Array.isArray(user.role) ? user.role : (user.role ? [user.role as string] : [])
        return { userId: user.id, role }
      }
    }
  }

  return null
}
