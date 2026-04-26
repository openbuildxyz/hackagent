import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { AGENT_PUBLIC_FIELDS } from '@/lib/agent'

// GET /api/agent/:agentId — public profile, excludes claim_token_hash.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params
  const db = createServiceClient()

  const { data: agent } = await db
    .from('agents')
    .select(AGENT_PUBLIC_FIELDS)
    .eq('id', agentId)
    .is('deleted_at', null)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  return NextResponse.json(agent)
}
