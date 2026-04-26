import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { generateApiKey } from '@/lib/apikey'

// GET — 列出当前用户所有 API keys
export async function GET(_request: NextRequest) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data, error } = await db
    .from('api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST — 生成新 API key，明文只返回一次
export async function POST(request: NextRequest) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { name: string }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { key, prefix, hash } = generateApiKey()
  const db = createServiceClient()

  const { data, error } = await db
    .from('api_keys')
    .insert({
      user_id: session.userId,
      name: body.name.trim(),
      key_hash: hash,
      key_prefix: prefix,
    })
    .select('id, name, key_prefix, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 明文 key 只在这里返回一次
  return NextResponse.json({ ...data, key }, { status: 201 })
}
