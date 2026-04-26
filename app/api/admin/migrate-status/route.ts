import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

// One-time migration: Status Machine v1.1
// DELETE THIS FILE AFTER RUNNING
export async function POST(req: NextRequest) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.role?.includes('admin')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })

  const db = createServiceClient()
  const results: string[] = []

  // Fix NULL statuses first
  const { error: e0 } = await db
    .from('events')
    .update({ status: 'draft' })
    .is('status', null)
    .is('deleted_at', null)
  results.push(`null_status_fix: ${e0 ? e0.message : 'ok'}`)

  // Verify current state
  const { data: counts } = await db
    .from('events')
    .select('status')
    .is('deleted_at', null)

  const statusCounts: Record<string, number> = {}
  for (const r of (counts ?? [])) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1
  }

  return NextResponse.json({
    message: 'Supabase JS client cannot execute DDL. Use Supabase SQL Editor to run the migration SQL below.',
    sql: `
-- Run in Supabase SQL Editor:
ALTER TABLE events ADD COLUMN IF NOT EXISTS judging_end TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
UPDATE events SET status = 'draft' WHERE status IS NULL AND deleted_at IS NULL;
`,
    statusCounts,
    results,
  })
}
