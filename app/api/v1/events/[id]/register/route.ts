import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getAgentUser } from '@/lib/agentAuth'
import { generateAgentId, generateClaimToken } from '@/lib/agent'
import { rateLimit, getClientIp, rateLimitHeaders } from '@/lib/ratelimit'

type FieldDef = { key: string; label: string; type: string; required: boolean }

// POST /api/v1/events/[id]/register
// Auth model:
//   • Human registrations require an API key (getAgentUser returns a userId).
//   • Agent registrations (`is_agent: true`) are zero-friction — no key required;
//     the agent is recorded via agent_id and the registration's user_id is left null.
//
// Security:
//   • Only events with status === 'recruiting' (or 'hacking' for late signup) accept
//     registrations — draft/done/etc are rejected even if registration_config.open is true.
//   • Anonymous new-agent registrations (is_agent=true, no agent_id, no api key)
//     are rate-limited by IP+event to prevent bulk spam flooding.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawBody = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const isAgent = rawBody['is_agent'] === true
  const agentIdInput =
    typeof rawBody['agent_id'] === 'string' ? (rawBody['agent_id'] as string).trim() : ''
  const body = rawBody as Record<string, string>

  const user = await getAgentUser(request)
  // Zero-friction agent path: allow unauthenticated POSTs only when is_agent=true.
  if (!user && !isAgent) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId: string | null = user?.userId ?? null

  const { id: eventId } = await params
  const db = createServiceClient()

  // Rate-limit anonymous new-agent registrations (no userId, no existing agent_id).
  // These bypass the duplicate-check key, so IP-based limits are the only wall
  // against bulk spam. Authenticated callers and agents supplying an existing
  // agent_id are already gated by the duplicate-check below.
  const isAnonymousNewAgent = isAgent && !userId && !agentIdInput
  if (isAnonymousNewAgent) {
    const ip = getClientIp(request)
    // 3 new-agent registrations per IP per event per 5min. Generous enough for
    // a human testing the flow; tight enough that a scripted flood hits 429 fast.
    const rl = await rateLimit({
      bucket: `v1-reg-anon:${eventId}`,
      key: ip,
      limit: 3,
      windowSec: 300,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          message:
            'Too many anonymous agent registrations from this IP. Pre-register via /api/agent/register to get an agent_id, then retry with agent_id.',
        },
        { status: 429, headers: rateLimitHeaders(rl) }
      )
    }
  }

  const { data: event } = await db
    .from('events')
    .select('id, status, registration_config, registration_deadline')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Only 'recruiting' or 'hacking' events accept registrations. draft/judging/done/cancelled all
  // refuse, regardless of registration_config.open — a draft event must not leak via public POST
  // even if the organizer flipped open=true.
  if (event.status !== 'recruiting' && event.status !== 'hacking') {
    return NextResponse.json(
      { error: 'Event is not accepting registrations', status: event.status },
      { status: 400 }
    )
  }

  const config = event.registration_config as {
    open: boolean
    auto_approve: boolean
    allow_multiple_agents_per_owner?: boolean
    fields: FieldDef[]
  } | null

  if (!config?.open) {
    return NextResponse.json({ error: 'Registration is not open' }, { status: 400 })
  }

  if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
    return NextResponse.json({ error: 'Registration deadline has passed' }, { status: 400 })
  }

  const allowMultiAgents = config.allow_multiple_agents_per_owner === true

  // Duplicate check —
  // • Keyed by user_id when the caller is authenticated.
  // • Keyed by agent_id when an unauthenticated agent supplied a known agent_id.
  // • For brand-new anonymous agents (no agent_id, no user_id) the IP rate
  //   limit above is the only guard — there's no stable key yet.
  if (userId || agentIdInput) {
    const dupQuery = db
      .from('registrations')
      .select('id, status, is_agent')
      .eq('event_id', eventId)
    const { data: existing } = userId
      ? await dupQuery.eq('user_id', userId)
      : await dupQuery.eq('agent_id', agentIdInput)

    if (existing && existing.length > 0) {
      const allExistingAreAgents = existing.every(r => (r as { is_agent: boolean | null }).is_agent === true)
      // Agent trying to register a second agent under the same user: specific error code
      // so callers (and the UI) can distinguish this from a plain duplicate.
      if (isAgent && allExistingAreAgents && !allowMultiAgents) {
        return NextResponse.json(
          {
            error: 'multiple_agents_not_allowed',
            message: 'This event allows only one agent per user. Ask the organizer to enable multiple agents.',
          },
          { status: 409 }
        )
      }
      if (!(isAgent && allowMultiAgents && allExistingAreAgents)) {
        return NextResponse.json(
          { error: 'Already registered', id: existing[0].id, status: existing[0].status },
          { status: 409 }
        )
      }
    }
  }

  // 按 registration_config.fields 动态验证 required 字段
  const fields: FieldDef[] = config.fields ?? []
  const missing: string[] = []
  for (const f of fields) {
    if (f.required && !body[f.key]?.toString().trim()) {
      missing.push(f.key)
    }
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Missing required fields', fields: missing },
      { status: 400 }
    )
  }

  // team_name / github_url 从约定字段取，其余放 extra_fields
  const team_name = (body['project_name'] ?? body['team_name'] ?? '').trim()
  if (!team_name) {
    return NextResponse.json({ error: 'project_name or team_name is required' }, { status: 400 })
  }
  const github_url = body['github_url'] ?? null
  const extra_fields: Record<string, string> = {}
  for (const f of fields) {
    if (f.key !== 'project_name' && f.key !== 'team_name' && f.key !== 'github_url') {
      extra_fields[f.key] = body[f.key] ?? ''
    }
  }

  // Resolve / auto-create agent profile when the caller self-identifies as an agent.
  let resolvedAgentId: string | null = null
  let issuedClaimToken: string | null = null
  if (isAgent) {
    if (agentIdInput) {
      const { data: existingAgent } = await db
        .from('agents')
        .select('id')
        .eq('id', agentIdInput)
        .is('deleted_at', null)
        .single()
      if (!existingAgent) {
        return NextResponse.json(
          { error: 'agent_id not found', agent_id: agentIdInput },
          { status: 404 }
        )
      }
      resolvedAgentId = existingAgent.id
    } else {
      const newId = generateAgentId()
      const { token, hash } = generateClaimToken()
      const { error: agentErr } = await db.from('agents').insert({
        id: newId,
        agent_name: team_name || 'Anonymous Agent',
        owner_user_id: userId,
        model: body['model'] ?? null,
        framework: body['framework'] ?? null,
        github: body['github_url'] ?? null,
        claim_token_hash: hash,
        claim_token_used: false,
      })
      if (agentErr) {
        return NextResponse.json({ error: agentErr.message }, { status: 500 })
      }
      resolvedAgentId = newId
      issuedClaimToken = token
    }
  }

  const status = config.auto_approve ? 'approved' : 'pending'

  const { data: reg, error } = await db
    .from('registrations')
    .insert({
      event_id: eventId,
      user_id: userId,
      team_name,
      github_url,
      extra_fields,
      status,
      is_agent: isAgent,
      agent_id: resolvedAgentId,
    })
    .select('id, status')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (status === 'approved') {
    await db.from('projects').insert({
      event_id: eventId,
      registration_id: reg.id,
      name: team_name,
      team_name,
      github_url: github_url ?? null,
      description: body['description'] ?? null,
      status: 'pending',
    })
  }

  // 返回时告知调用方需要哪些字段（方便 Agent 调试）
  const requiredFields = fields.filter(f => f.required).map(f => ({ key: f.key, label: f.label }))

  const response: Record<string, unknown> = {
    id: reg.id,
    status: reg.status,
    required_fields: requiredFields,
  }
  if (resolvedAgentId) response.agent_id = resolvedAgentId
  if (issuedClaimToken) {
    response.claim_token = issuedClaimToken
    response.claim_token_notice =
      'Save this claim_token — it is shown only once. Use it at /my-agents to bind this agent to another account.'
  }

  return NextResponse.json(response, { status: 201 })
}

// GET /api/v1/events/[id]/register — 返回该活动的报名字段配置，让 Agent 知道要填什么
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params
  const db = createServiceClient()

  const { data: event } = await db
    .from('events')
    .select('id, name, description, status, registration_config, registration_deadline, submission_deadline, result_announced_at, tracks')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const config = event.registration_config as {
    open: boolean
    auto_approve: boolean
    allow_multiple_agents_per_owner?: boolean
    fields: FieldDef[]
  } | null

  return NextResponse.json({
    event_id: eventId,
    event_name: event.name,
    description: event.description ?? null,
    status: event.status,
    open: config?.open ?? false,
    timeline: {
      registration_deadline: event.registration_deadline ?? null,
      submission_deadline: (event as Record<string, unknown>)['submission_deadline'] ?? null,
      result_announced_at: (event as Record<string, unknown>)['result_announced_at'] ?? null,
    },
    tracks: (event as Record<string, unknown>)['tracks'] ?? [],
    fields: config?.fields ?? [],
  })
}
