import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Public endpoint — no auth required
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params
  const db = createServiceClient()

  const { data: event, error } = await db
    .from('events')
    .select('id, name, description, track, tracks, registration_config, registration_deadline, submission_deadline, banner_url')
    .eq('id', eventId)
    .neq('status', 'draft')
    .is('deleted_at', null)
    .single()

  if (error || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  return NextResponse.json(event)
}
