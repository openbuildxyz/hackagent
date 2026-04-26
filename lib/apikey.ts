import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase'

/** 生成 API key：明文 hk_live_<32 hex chars>，prefix 为前缀展示用，hash 用于存储 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(16).toString('hex') // 32 chars
  const key = `hk_live_${random}`
  const prefix = key.slice(0, 16) // "hk_live_" + first 8 hex chars
  const hash = crypto.createHash('sha256').update(key).digest('hex')
  return { key, prefix, hash }
}

/** 验证 API key，返回 user row 或 null；同时更新 last_used_at */
export async function verifyApiKey(key: string): Promise<{ id: string; role: string[] } | null> {
  const hash = crypto.createHash('sha256').update(key).digest('hex')
  const db = createServiceClient()

  const { data: apiKey } = await db
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', hash)
    .single()

  if (!apiKey || apiKey.revoked_at) return null

  // 异步更新 last_used_at，不阻塞响应
  db.from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id)
    .then(() => {})

  const { data: user } = await db
    .from('users')
    .select('id, role')
    .eq('id', apiKey.user_id)
    .single()

  if (!user) return null

  const role: string[] = Array.isArray(user.role) ? user.role : (user.role ? [user.role as string] : [])
  return { id: user.id, role }
}
