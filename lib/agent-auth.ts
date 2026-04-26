import { verifyApiKey } from '@/lib/apikey'

/**
 * Authenticate request via Bearer API key.
 * Extracts key from Authorization: Bearer <key>,
 * verifies against api_keys table (key_hash match),
 * updates last_used_at, and returns the owner's userId.
 */
export async function authenticateApiKey(
  request: Request
): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const key = authHeader.slice(7).trim()
  if (!key) return null

  const user = await verifyApiKey(key)
  if (!user) return null

  return { userId: user.id }
}
