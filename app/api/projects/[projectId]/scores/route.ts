import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { assertProjectReadable } from '@/lib/project-access'

// GET /api/projects/[projectId]/scores
// Access: event owner, accepted/active reviewer, or admin.
// AI scores/comments are internal; do NOT expose to arbitrary authenticated users.
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
    .from('scores')
    .select('id, model, dimension_scores, overall_score, comment, web3_insight, status')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
