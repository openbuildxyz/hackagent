import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  const { data: event } = await db
    .from('events')
    .select('models, web3_enabled')
    .eq('id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const { count: projectCount } = await db
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  const { data: user } = await db
    .from('users')
    .select('credits')
    .eq('id', session.userId)
    .single()

  const credits = user?.credits ?? 0
  const count = projectCount ?? 0
  const costPerProject = event.models.length + (event.web3_enabled ? 0.5 : 0)
  const cost = Math.ceil(count * costPerProject)

  return NextResponse.json({
    credits,
    cost,
    projectCount: count,
    hasEnough: credits >= cost,
  })
}
