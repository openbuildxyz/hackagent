import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

// POST /api/projects/[projectId]/score-edit
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  const { scoreId, model, dimensionName, oldScore, newScore } = await req.json()

  const db = createServiceClient()

  // Verify ownership: project → event → user_id
  const { data: project } = await db
    .from('projects')
    .select('id, event_id, events(user_id)')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const eventOwner = (project.events as { user_id?: string } | null)?.user_id
  if (eventOwner !== session.userId) {
    // Also allow reviewer
    const { data: reviewer } = await db
      .from('event_reviewers')
      .select('id')
      .eq('event_id', project.event_id)
      .eq('user_id', session.userId)
      .single()
    if (!reviewer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Scope check: scoreId must belong to this projectId. Without matching on
  // project_id here, an event owner authorized above for project A could
  // submit a scoreId that actually belongs to project B in a different event
  // and tamper with its scores. The single query filter closes that gap.
  const { data: score } = await db
    .from('scores')
    .select('dimension_scores, overall_score')
    .eq('id', scoreId)
    .eq('project_id', projectId)
    .single()

  if (!score) return NextResponse.json({ error: 'Score not found' }, { status: 404 })

  const dims = { ...(score.dimension_scores ?? {}) }
  dims[dimensionName] = newScore
  const values = Object.values(dims) as number[]
  const newOverall = values.reduce((a, b) => a + b, 0) / values.length

  await db.from('scores').update({
    dimension_scores: dims,
    overall_score: newOverall,
  }).eq('id', scoreId)

  // Log the edit
  await db.from('score_edits').insert({
    project_id: projectId,
    reviewer_id: session.userId,
    model_key: model,
    dimension_name: dimensionName,
    old_score: oldScore,
    new_score: newScore,
  })

  return NextResponse.json({ success: true, new_overall: newOverall })
}
