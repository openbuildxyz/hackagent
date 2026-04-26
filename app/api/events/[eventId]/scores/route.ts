import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

// GET /api/events/[eventId]/scores - get all scores for an event (owner only)
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

  // Verify event ownership
  const { data: event } = await db
    .from('events')
    .select('id')
    .eq('id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Get project IDs for this event
  const { data: projects } = await db
    .from('projects')
    .select('id')
    .eq('event_id', eventId)

  if (!projects || projects.length === 0) {
    return NextResponse.json([])
  }

  const projectIds = projects.map(p => p.id)

  const { data: scores } = await db
    .from('scores')
    .select(`
      id,
      project_id,
      model,
      dimension_scores,
      overall_score,
      final_dimension_scores,
      final_overall_score,
      comment,
      status,
      projects(id, name, team_name)
    `)
    .in('project_id', projectIds)
    .eq('status', 'done')
    .order('created_at', { ascending: true })

  return NextResponse.json(scores ?? [])
}
