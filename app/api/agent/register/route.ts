import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { generateAgentId, generateClaimToken } from '@/lib/agent'
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/ratelimit'

// Anonymous agent registration: 10 registrations per IP per hour.
// Authenticated users (session cookie / api-key) get a separate higher bucket.
const ANON_LIMIT = 10
const ANON_WINDOW_SEC = 3600

type RegisterBody = {
  agent_name?: string
  owner_email?: string
  model?: string
  framework?: string
  capabilities?: string[]
  github?: string
  statement?: string
  parent_agent_id?: string
}

// POST /api/agent/register — public endpoint to create an Agent profile.
// Returns { agent_id, claim_token } — claim_token is shown only once.
export async function POST(request: NextRequest) {
  // Rate-limit unauthenticated registration to prevent DB spam.
  const rl = await rateLimit({
    bucket: 'agent-register-anon',
    key: getClientIp(request),
    limit: ANON_LIMIT,
    windowSec: ANON_WINDOW_SEC,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many registrations from this IP. Try again later.' },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }

  let body: RegisterBody
  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const agentName = body.agent_name?.trim()
  if (!agentName) {
    return NextResponse.json({ error: 'agent_name is required' }, { status: 400 })
  }
  // Basic length guards to prevent oversized payloads in indexed fields.
  if (agentName.length > 200) {
    return NextResponse.json({ error: 'agent_name must be ≤ 200 characters' }, { status: 400 })
  }
  if (body.statement && body.statement.length > 2000) {
    return NextResponse.json({ error: 'statement must be ≤ 2000 characters' }, { status: 400 })
  }

  const db = createServiceClient()
  const agentId = generateAgentId()
  const { token: claimToken, hash: claimHash } = generateClaimToken()

  const { error } = await db.from('agents').insert({
    id: agentId,
    agent_name: agentName,
    owner_email: body.owner_email ?? null,
    model: body.model ?? null,
    framework: body.framework ?? null,
    capabilities: Array.isArray(body.capabilities) ? body.capabilities : null,
    github: body.github ?? null,
    statement: body.statement ?? null,
    parent_agent_id: body.parent_agent_id ?? null,
    claim_token_hash: claimHash,
    claim_token_used: false,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    {
      agent_id: agentId,
      claim_token: claimToken,
      message:
        'Agent registered. Save the claim_token — it is shown only once and is required to bind this agent to a user account at /my-agents.',
    },
    { status: 201 }
  )
}
