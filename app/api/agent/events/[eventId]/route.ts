import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey } from '@/lib/agent-auth'

// GET /api/agent/events/[eventId] — event details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const auth = await authenticateApiKey(request)
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  const { data: event, error } = await db
    .from('events')
    .select('id, name, description, status, registration_config, tracks, registration_deadline, submission_deadline, result_announced_at, banner_url')
    .eq('id', eventId)
    .neq('status', 'draft')
    .is('deleted_at', null)
    .single()

  if (error || !event) {
    return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: event })
}
