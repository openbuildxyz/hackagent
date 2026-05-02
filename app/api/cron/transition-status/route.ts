import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { canTransitionEventStatus, deriveEventStatus, type EventStatus } from '@/lib/event-status'

type EventRow = {
  id: string
  status: string
  registration_open_at: string | null
  start_time: string | null
  registration_deadline: string | null
  submission_deadline: string | null
  judging_end: string | null
  result_announced_at: string | null
  registration_config: Record<string, unknown> | null
}

type CountKey = `${EventStatus}_to_${EventStatus}`

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })

  const auth = request.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServiceClient()
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: events, error } = await db
    .from('events')
    .select('id, status, registration_open_at, start_time, registration_deadline, submission_deadline, judging_end, result_announced_at, registration_config')
    .is('deleted_at', null)
    .not('status', 'in', '(done,cancelled)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = { scanned: events?.length ?? 0, failed: 0 }
  const errors: Array<{ id: string; message: string }> = []

  for (const event of (events ?? []) as EventRow[]) {
    const target = deriveEventStatus(event, now)
    if (!target || target === event.status) continue
    if (!canTransitionEventStatus(event.status, target)) continue

    const prevConfig = (event.registration_config ?? {}) as Record<string, unknown>
    const update: Record<string, unknown> = {
      status: target,
      registration_config: target === 'recruiting'
        ? { ...prevConfig, open: true }
        : { ...prevConfig, open: false },
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

    const key: CountKey = `${event.status as EventStatus}_to_${target}`
    counts[key] = (counts[key] ?? 0) + 1

    if (target === 'judging') {
      await db.from('teams').update({ status: 'locked' }).eq('event_id', event.id).eq('status', 'open')
    }
  }

  return NextResponse.json({ ok: true, ranAt: nowIso, counts, errors })
}
