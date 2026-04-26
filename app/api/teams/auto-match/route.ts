import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase'

const AI_API_BASE = process.env.ZENMUX_API_URL || 'https://zenmux.ai/api/v1'
const AI_API_URL = `${AI_API_BASE}/chat/completions`
const AI_API_KEY = process.env.ZENMUX_API_KEY || process.env.COMMONSTACK_API_KEY
const AI_MODEL = 'z-ai/glm-4.5-air'

type Participant = {
  user_id: string
  name: string
  skills: string[]
}

type TeamGroup = {
  team_name: string
  members: { user_id: string; name: string; skills: string[] }[]
  rationale: string
}

// POST /api/teams/auto-match — AI-powered team matching
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { event_id, participants, team_size = 4 }: {
    event_id: string
    participants: Participant[]
    team_size?: number
  } = body

  if (!event_id || !participants || !Array.isArray(participants) || participants.length === 0) {
    return NextResponse.json({ error: 'event_id and participants are required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  if (!AI_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured (ZENMUX_API_KEY missing)' }, { status: 503 })
  }

  // Verify event exists and user is owner
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, user_id, name')
    .eq('id', event_id)
    .single()

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  if (event.user_id !== user.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const prompt = `You are a hackathon team organizer. Your task is to form balanced teams based on skill complementarity.

Event: ${event.name}
Team size: ${team_size} members per team
Participants (${participants.length} total):
${participants.map((p, i) => `${i + 1}. ${p.name} (ID: ${p.user_id}) — Skills: ${p.skills.join(', ') || 'not specified'}`).join('\n')}

Please form teams of approximately ${team_size} members each, ensuring:
1. Each team has complementary skills (mix of frontend, backend, design, etc.)
2. No team should be significantly weaker than others
3. Teams should be balanced in skill diversity

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{
  "teams": [
    {
      "team_name": "Team Alpha",
      "members": [
        {"user_id": "...", "name": "...", "skills": ["..."]}
      ],
      "rationale": "Brief reason for this grouping"
    }
  ],
  "unmatched": []
}`

  let aiResponse: { teams: TeamGroup[]; unmatched: Participant[] }

  try {
    const res = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY!}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('AI API error:', errText)
      return NextResponse.json({ error: 'AI service error' }, { status: 502 })
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''

    // Extract JSON from response (handle potential markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('AI returned non-JSON:', content)
      return NextResponse.json({ error: 'AI returned invalid response' }, { status: 502 })
    }

    aiResponse = JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('AI auto-match error:', err)
    return NextResponse.json({ error: 'Failed to contact AI service' }, { status: 502 })
  }

  return NextResponse.json({ result: aiResponse })
}
