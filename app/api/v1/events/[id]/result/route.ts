import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/v1/events/[id]/result — 公开，返回活动最终评审排名
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params
  const db = createServiceClient()

  const { data: event } = await db
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  if (event.status !== 'done') {
    return NextResponse.json({
      status: 'judging',
      message: 'Results are not ready yet',
    })
  }

  const { data: projects } = await db
    .from('projects')
    .select('id, name, github_url, final_score, rank')
    .eq('event_id', eventId)
    .not('final_score', 'is', null)
    .order('final_score', { ascending: false })

  if (!projects || projects.length === 0) {
    return NextResponse.json({
      status: 'judging',
      message: 'Results are not ready yet',
    })
  }

  return NextResponse.json({ status: 'done', results: projects })
}
