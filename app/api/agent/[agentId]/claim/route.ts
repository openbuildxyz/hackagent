import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { hashClaimToken } from '@/lib/agent'

// PUT /api/agent/:agentId/claim — bind an agent profile to the current user,
// consuming a one-time claim_token. First caller wins.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { agentId } = await params
  let body: { claim_token?: string }
  try {
    body = (await request.json()) as { claim_token?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const claimToken = body.claim_token?.trim()
  if (!claimToken) {
    return NextResponse.json({ error: 'claim_token is required' }, { status: 422 })
  }

  const db = createServiceClient()
  const { data: agent } = await db
    .from('agents')
    .select('id, claim_token_hash, claim_token_used, owner_user_id')
    .eq('id', agentId)
    .is('deleted_at', null)
    .single()

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  if (agent.claim_token_used) {
    return NextResponse.json({ error: 'Claim token has already been used' }, { status: 409 })
  }

  if (!agent.claim_token_hash || hashClaimToken(claimToken) !== agent.claim_token_hash) {
    return NextResponse.json({ error: 'Invalid claim_token' }, { status: 422 })
  }

  const { error } = await db
    .from('agents')
    .update({
      owner_user_id: session.userId,
      claim_token_used: true,
    })
    .eq('id', agentId)
    .eq('claim_token_used', false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, agent_id: agentId })
}
