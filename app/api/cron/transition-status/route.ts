import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/cron/transition-status — Vercel cron handler for OPE-100 status v1.1.
// Auto-transitions events through the lifecycle based on time fields.
//   recruiting → hacking  : registration_deadline < now AND submission_deadline set
//   recruiting → judging  : registration_deadline < now AND no submission_deadline
//   hacking    → judging  : submission_deadline   < now
//   judging    → done     : judging_end < now (preferred) OR result_announced_at < now
// On every transition we also force registration_config.open = false so a stale
// `open: true` flag can never let new registrations slip in after the deadline.

type EventRow = {
  id: string
  status: string
  registration_deadline: string | null
  submission_deadline: string | null
  judging_end: string | null
  result_announced_at: string | null
  registration_config: Record<string, unknown> | null
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = request.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: events, error } = await db
    .from('events')
    .select('id, status, registration_deadline, submission_deadline, judging_end, result_announced_at, registration_config')
    .is('deleted_at', null)
    .not('status', 'in', '(draft,done,cancelled)')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts = {
    recruiting_to_hacking: 0,
    recruiting_to_judging: 0,
    hacking_to_judging: 0,
    judging_to_done: 0,
    scanned: events?.length ?? 0,
    failed: 0,
  }
  const errors: Array<{ id: string; message: string }> = []

  for (const event of (events ?? []) as EventRow[]) {
    const target = nextStatus(event, now)
    if (!target) continue

    const prevConfig = (event.registration_config ?? {}) as Record<string, unknown>
    const update: Record<string, unknown> = { status: target }
    if (event.registration_config !== null && event.registration_config !== undefined) {
      update.registration_config = { ...prevConfig, open: false }
    }

    const { error: updateError } = await db
      .from('events')
      .update(update)
      .eq('id', event.id)
      .eq('status', event.status)

    if (updateError) {
      counts.failed += 1
      errors.push({ id: event.id, message: updateError.message })
      continue
    }

    if (event.status === 'recruiting' && target === 'hacking') counts.recruiting_to_hacking += 1
    else if (event.status === 'recruiting' && target === 'judging') counts.recruiting_to_judging += 1
    else if (event.status === 'hacking' && target === 'judging') counts.hacking_to_judging += 1
    else if (event.status === 'judging' && target === 'done') counts.judging_to_done += 1
  }

  return NextResponse.json({ ok: true, ranAt: nowIso, counts, errors })
}

function nextStatus(event: EventRow, now: Date): string | null {
  const regPassed = event.registration_deadline !== null && new Date(event.registration_deadline) < now
  const subPassed = event.submission_deadline !== null && new Date(event.submission_deadline) < now
  const judgingEndPassed = event.judging_end !== null && new Date(event.judging_end) < now
  const resultAnnouncedPassed = event.result_announced_at !== null && new Date(event.result_announced_at) < now

  if (event.status === 'recruiting' && regPassed) {
    return event.submission_deadline ? 'hacking' : 'judging'
  }
  if (event.status === 'hacking' && subPassed) {
    return 'judging'
  }
  if (event.status === 'judging' && (judgingEndPassed || resultAnnouncedPassed)) {
    return 'done'
  }
  return null
}
