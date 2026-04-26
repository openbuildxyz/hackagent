import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { deductCredits } from '@/lib/credits'

// POST /api/events/[eventId]/credits-deduct
// Deducts credits for running AI analysis on all projects in an event
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  // Verify event ownership
  const { data: event } = await db
    .from('events')
    .select('id, models, web3_enabled')
    .eq('id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Count projects
  const { count: projectCount } = await db
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  const count = projectCount ?? 0
  const models = (event.models as string[]) ?? []
  const costPerProject = models.length + (event.web3_enabled ? 0.5 : 0)
  const cost = Math.ceil(count * costPerProject)

  const result = await deductCredits(session.userId, cost)

  if (!result.success) {
    return NextResponse.json({
      error: result.error ?? 'Failed to deduct credits',
    }, { status: result.error === '积分不足' ? 402 : 500 })
  }

  return NextResponse.json({
    success: true,
    deducted: cost,
    remaining: result.remaining,
  })
}
