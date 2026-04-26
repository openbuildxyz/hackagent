import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

// GET /api/events/[eventId]/reviewer-scores
// Returns: { scores: ReviewerScore[], finalScores: FinalScore[], customWeights: DimWeight[] | null }
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  const { data: reviewer } = await db
    .from('event_reviewers')
    .select('id, custom_dimension_weights')
    .eq('event_id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!reviewer) return NextResponse.json({ error: '您不是该活动的评委' }, { status: 403 })

  // All AI scores for this reviewer (all models)
  const { data: scores } = await db
    .from('reviewer_scores')
    .select(`
      id, project_id, model, dimension_prompt,
      ai_dimension_scores, ai_overall_score, ai_comment,
      final_dimension_scores, final_overall_score, status,
      projects(id, name, github_url, demo_url, description, team_name, analysis_result)
    `)
    .eq('event_id', eventId)
    .eq('reviewer_id', session.userId)
    .order('created_at', { ascending: true })

  // Final submitted scores
  const { data: finalScores } = await db
    .from('reviewer_final_scores')
    .select('project_id, final_overall_score, final_dimension_scores, source, selected_models, submitted_at')
    .eq('event_id', eventId)
    .eq('reviewer_id', session.userId)

  const result = (scores ?? []).map(s => {
    const { projects, ...rest } = s as typeof s & { projects: unknown }
    return { ...rest, project: projects }
  })

  return NextResponse.json({
    scores: result,
    finalScores: finalScores ?? [],
    customWeights: reviewer.custom_dimension_weights ?? null,
  })
}

// PATCH /api/events/[eventId]/reviewer-scores — save custom dimension weights
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const { custom_dimension_weights } = await request.json() as {
    custom_dimension_weights: Array<{ name: string; weight: number }>
  }

  const db = createServiceClient()

  const { error } = await db
    .from('event_reviewers')
    .update({ custom_dimension_weights })
    .eq('event_id', eventId)
    .eq('user_id', session.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
