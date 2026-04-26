import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { authenticateApiKey } from '@/lib/agent-auth'

// GET /api/agent/events/[eventId]/status — check current user's registration & submission status
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

  // Check registration
  const { data: reg, error: regError } = await db
    .from('registrations')
    .select('id, status, team_name, github_url, submitted_at')
    .eq('event_id', eventId)
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (regError) {
    return NextResponse.json({ success: false, error: regError.message }, { status: 500 })
  }

  if (!reg) {
    return NextResponse.json({
      success: true,
      data: { registered: false, registration: null, submitted: false, project: null },
    })
  }

  // Check project submission via team_name
  const { data: project } = reg.team_name
    ? await db
        .from('projects')
        .select('id, name, github_url, demo_url, status, created_at')
        .eq('event_id', eventId)
        .eq('name', reg.team_name)
        .maybeSingle()
    : { data: null }

  return NextResponse.json({
    success: true,
    data: {
      registered: true,
      registration: {
        id: reg.id,
        status: reg.status,
        team_name: reg.team_name,
        github_url: reg.github_url,
        submitted_at: reg.submitted_at,
      },
      submitted: !!project,
      project: project
        ? {
            id: project.id,
            name: project.name,
            github_url: project.github_url,
            demo_url: (project as Record<string, unknown>)['demo_url'] ?? null,
            status: project.status,
            created_at: project.created_at,
          }
        : null,
    },
  })
}
