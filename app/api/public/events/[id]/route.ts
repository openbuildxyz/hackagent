import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = createServiceClient()

  const { data: event, error } = await db
    .from('events')
    .select('id, name, description, status, registration_config, tracks, registration_deadline, submission_deadline, result_announced_at, banner_url, public_vote')
    .eq('id', id)
    .neq('status', 'draft')
    .is('deleted_at', null)
    .single()

  if (error || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  return NextResponse.json(event)
}
