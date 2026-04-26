import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * HackAgent A2A Endpoint
 * Handles JSON-RPC 2.0 Task requests from AI Agents.
 * Spec: https://google.github.io/A2A/specification/
 */

type JSONRPCRequest = {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

function ok(id: string | number, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result })
}

function err(id: string | number, code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message, data } })
}

export async function POST(request: NextRequest) {
  let body: JSONRPCRequest
  try {
    body = await request.json()
  } catch {
    return err(0, -32700, 'Parse error')
  }

  const { id, method, params = {} } = body

  if (body.jsonrpc !== '2.0') {
    return err(id, -32600, 'Invalid JSON-RPC version')
  }

  const db = createServiceClient()

  // ── tasks/send ─────────────────────────────────────────────────────────────
  if (method === 'tasks/send') {
    const message = (params as { message?: { parts?: { text?: string }[] } })?.message
    const text = message?.parts?.[0]?.text ?? ''
    const human_did = (params as { metadata?: { human_did?: string } })?.metadata?.human_did

    // Route intent from text
    if (/register|sign.?up|join/i.test(text)) {
      // List available events
      const { data: events } = await db
        .from('events')
        .select('id, name, status, tracks, registration_config')
        .neq('status', 'draft')
        .is('deleted_at', null)
        .not('name', 'ilike', '%test%')
        .not('name', 'ilike', '%测试%')
        .limit(5)

      const eventList = (events ?? [])
        .map(e => `• ${e.name} (id: ${e.id}, status: ${e.status})`)
        .join('\n') || 'No open events at the moment.'

      return ok(id, {
        id: `task-${Date.now()}`,
        status: { state: 'completed' },
        artifacts: [{
          parts: [{
            type: 'text',
            text: `Available hackathons:\n${eventList}\n\nTo register, provide your event_id, team_name, and project details.${human_did ? ` Your DID (${human_did}) will be recorded for Sybil resistance.` : ''}`,
          }],
        }],
      })
    }

    if (/submit|project|github/i.test(text)) {
      // Extract github URL if present
      const githubMatch = text.match(/https?:\/\/github\.com\/[^\s]+/)
      if (githubMatch) {
        return ok(id, {
          id: `task-${Date.now()}`,
          status: { state: 'input-required' },
          artifacts: [{
            parts: [{
              type: 'text',
              text: `Got your GitHub URL: ${githubMatch[0]}\n\nPlease also provide:\n- event_id (which hackathon?)\n- project name\n- demo_url (optional)\n- description (1-2 sentences)`,
            }],
          }],
        })
      }
      return ok(id, {
        id: `task-${Date.now()}`,
        status: { state: 'input-required' },
        artifacts: [{
          parts: [{ type: 'text', text: 'Please provide your GitHub repository URL and the event_id to submit your project.' }],
        }],
      })
    }

    if (/result|score|rank|leaderboard/i.test(text)) {
      // Extract event_id if provided
      const eventIdMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      if (eventIdMatch) {
        const { data: event } = await db
          .from('events')
          .select('id, name, status')
          .eq('id', eventIdMatch[0])
          .neq('status', 'draft')
          .is('deleted_at', null)
          .not('name', 'ilike', '%test%')
          .not('name', 'ilike', '%测试%')
          .maybeSingle()
        if (event) {
          const reportUrl = `https://hackathon.xyz/report/${event.id}`
          return ok(id, {
            id: `task-${Date.now()}`,
            status: { state: 'completed' },
            artifacts: [{ parts: [{ type: 'text', text: `Results for "${event.name}" (${event.status}):\n${reportUrl}` }] }],
          })
        }
      }
      // Show recent events with results
      const { data: done } = await db
        .from('events')
        .select('id, name')
        .eq('status', 'done')
        .is('deleted_at', null)
        .not('name', 'ilike', '%test%')
        .not('name', 'ilike', '%测试%')
        .limit(3)
      const list = (done ?? []).map(e => `• ${e.name}: https://hackathon.xyz/report/${e.id}`).join('\n')
      return ok(id, {
        id: `task-${Date.now()}`,
        status: { state: 'completed' },
        artifacts: [{ parts: [{ type: 'text', text: `Recent hackathon results:\n${list || 'No completed events.'}` }] }],
      })
    }

    // Default: capability overview
    return ok(id, {
      id: `task-${Date.now()}`,
      status: { state: 'completed' },
      artifacts: [{
        parts: [{
          type: 'text',
          text: `I'm HackAgent — an AI-powered hackathon platform.\n\nI can help you:\n• Register for a hackathon (say "register" or "sign up")\n• Submit a project (say "submit" + GitHub URL)\n• Get results (say "results" or "leaderboard")\n\nWhat would you like to do?`,
        }],
      }],
    })
  }

  // ── tasks/get ──────────────────────────────────────────────────────────────
  if (method === 'tasks/get') {
    return ok(id, { id: params.id, status: { state: 'completed' } })
  }

  // ── agents/list ────────────────────────────────────────────────────────────
  if (method === 'agents/list') {
    return ok(id, {
      agents: [{
        name: 'HackAgent',
        url: 'https://hackathon.xyz/api/a2a',
        agentCardUrl: 'https://hackathon.xyz/.well-known/agent.json',
      }],
    })
  }

  return err(id, -32601, `Method not found: ${method}`)
}

// Support GET for agent discovery
export async function GET() {
  return NextResponse.json({
    agent: 'HackAgent',
    a2a: true,
    agentCard: 'https://hackathon.xyz/.well-known/agent.json',
    endpoint: 'https://hackathon.xyz/api/a2a',
    methods: ['tasks/send', 'tasks/get', 'agents/list'],
  })
}
