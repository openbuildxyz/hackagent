import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

/**
 * POST /api/events/[eventId]/reviewer-submit
 * Body: { submissions: Array<{ project_id, source, selected_models?, final_dimension_scores, final_overall_score }> }
 * source: 'model:claude' | 'average' | 'custom'
 * Once submitted, rows are locked and cannot be changed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  const { data: reviewer } = await db
    .from('event_reviewers')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!reviewer) return NextResponse.json({ error: '您不是该活动的评委' }, { status: 403 })

  type Submission = {
    project_id: string
    source: string            // 'model:claude' | 'average' | 'custom'
    selected_models?: string[]
    final_dimension_scores: Record<string, number>
    final_overall_score: number
  }
  const { submissions } = await request.json() as { submissions: Submission[] }

  if (!Array.isArray(submissions) || !submissions.length) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 })
  }

  const projectIds = submissions.map(s => s.project_id)

  // Validate all project_ids belong to this event (prevent cross-event score pollution)
  const { data: validProjects } = await db
    .from('projects')
    .select('id')
    .eq('event_id', eventId)
    .in('id', projectIds)
  const validIds = new Set((validProjects ?? []).map(v => v.id))
  const invalid = projectIds.filter(id => !validIds.has(id))
  if (invalid.length > 0) {
    return NextResponse.json({ error: 'project_id 不属于该活动', invalid }, { status: 400 })
  }

  // Check none already submitted
  const { data: existing } = await db
    .from('reviewer_final_scores')
    .select('project_id')
    .eq('event_id', eventId)
    .eq('reviewer_id', session.userId)
    .in('project_id', projectIds)

  const alreadySubmitted = (existing ?? []).map(r => r.project_id)
  if (alreadySubmitted.length > 0) {
    return NextResponse.json({ error: `以下项目已提交，不可重复提交`, projects: alreadySubmitted }, { status: 409 })
  }

  const rows = submissions.map(s => ({
    event_id: eventId,
    project_id: s.project_id,
    reviewer_id: session.userId,
    final_dimension_scores: s.final_dimension_scores,
    final_overall_score: s.final_overall_score,
    source: s.source,
    selected_models: s.selected_models ?? null,
  }))

  const { error } = await db.from('reviewer_final_scores').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, submitted: rows.length })
}
