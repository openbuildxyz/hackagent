import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey } from '@/lib/agent-auth'

/**
 * POST /api/agent/events/create — create a hackathon event via API key
 *
 * Requires: API key with organizer or admin role.
 *
 * Body:
 * {
 *   name: string                    // required
 *   description?: string
 *   tracks?: { id: string; name: string; description?: string; prize?: string }[]
 *   dimensions?: { name: string; weight: number }[]
 *   registration_deadline?: string  // ISO 8601
 *   submission_deadline?: string    // ISO 8601
 *   registration_config?: {
 *     open?: boolean
 *     auto_approve?: boolean
 *     fields?: { key: string; label: string; type: string; required: boolean }[]
 *   }
 *   models?: string[]               // AI review models, e.g. ["gpt-4o", "claude-3-5-sonnet"]
 *   mode?: "ai_only" | "human_only" | "hybrid"
 *   banner_url?: string
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // Check user has organizer or admin role
  const { data: userRow } = await db
    .from('users')
    .select('role')
    .eq('id', auth.userId)
    .single()

  const role = (userRow?.role as string) ?? ''
  if (!role.includes('admin') && !role.includes('organizer')) {
    return NextResponse.json(
      { success: false, error: 'Your account does not have organizer permission. Contact admin to upgrade.' },
      { status: 403 }
    )
  }

  let body: {
    name?: string
    description?: string
    tracks?: { id: string; name: string; description?: string; prize?: string }[]
    dimensions?: { name: string; weight: number }[]
    registration_deadline?: string
    submission_deadline?: string
    registration_config?: {
      open?: boolean
      auto_approve?: boolean
      fields?: { key: string; label: string; type: string; required: boolean }[]
    }
    models?: string[]
    mode?: string
    banner_url?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 })
  }

  const { data: event, error } = await db
    .from('events')
    .insert({
      user_id: auth.userId,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      tracks: Array.isArray(body.tracks) ? body.tracks : [],
      dimensions: body.dimensions ?? [],
      models: body.models ?? [],
      mode: body.mode ?? 'ai_only',
      status: 'recruiting',
      banner_url: body.banner_url ?? null,
      registration_deadline: body.registration_deadline ?? null,
      submission_deadline: body.submission_deadline ?? null,
      registration_config: {
        open: body.registration_config?.open ?? false,
        auto_approve: body.registration_config?.auto_approve ?? false,
        fields: body.registration_config?.fields ?? [],
      },
      web3_enabled: false,
    })
    .select('id, name, status')
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: event }, { status: 201 })
}
