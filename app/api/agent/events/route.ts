import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey } from '@/lib/agent-auth'

// GET /api/agent/events — list events open for registration (status != draft, registration_config.open = true)
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request)
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  const { data: events, error } = await db
    .from('events')
    .select('id, name, description, status, registration_config, tracks, registration_deadline, submission_deadline')
    .in('status', ['recruiting', 'hacking'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Filter to only events with registration open
  const open = (events ?? []).filter((e) => {
    const cfg = e.registration_config as { open?: boolean } | null
    return cfg?.open === true
  })

  return NextResponse.json({ success: true, data: open })
}
