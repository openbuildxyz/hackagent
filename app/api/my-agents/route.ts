import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { AGENT_PUBLIC_FIELDS } from '@/lib/agent'

// GET /api/my-agents — agents owned by the current user, with event participation counts.
export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data: agents, error } = await db
    .from('agents')
    .select(AGENT_PUBLIC_FIELDS)
    .eq('owner_user_id', session.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ids = (agents ?? []).map(a => a.id)
  const counts: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: regs } = await db
      .from('registrations')
      .select('agent_id')
      .in('agent_id', ids)
    for (const r of regs ?? []) {
      const aid = (r as { agent_id: string | null }).agent_id
      if (aid) counts[aid] = (counts[aid] ?? 0) + 1
    }
  }

  return NextResponse.json(
    (agents ?? []).map(a => ({ ...a, event_count: counts[a.id] ?? 0 }))
  )
}
