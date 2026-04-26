import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { assertProjectReadable } from '@/lib/project-access'

// GET /api/projects/[projectId]
// Access: event owner, accepted/active reviewer, or admin. Others → 403.
// Public exposure must go through /api/public/... with field whitelists.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getSessionUser()
  const { projectId } = await params
  const db = createServiceClient()

  const access = await assertProjectReadable(db, projectId, session)
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { data, error } = await db
    .from('projects')
    .select('id, name, github_url, demo_url, team_name, description, tags, status, analysis_status, analysis_result, reviewer_submissions, event_id')
    .eq('id', projectId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
