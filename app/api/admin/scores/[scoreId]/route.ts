import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ scoreId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { scoreId } = await params
  const body = await req.json().catch(() => ({})) as {
    final_overall_score?: number
    final_dimension_scores?: Record<string, number>
    reason?: string
  }

  const update: Record<string, unknown> = {}
  if (typeof body.final_overall_score === 'number') update.final_overall_score = body.final_overall_score
  if (body.final_dimension_scores && typeof body.final_dimension_scores === 'object') update.final_dimension_scores = body.final_dimension_scores
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No score fields to update' }, { status: 400 })

  const db = createServiceClient()
  const { data: score, error: scoreError } = await db
    .from('reviewer_final_scores')
    .select('*, events!inner(status)')
    .eq('id', scoreId)
    .single()

  if (scoreError || !score) return NextResponse.json({ error: 'Score not found' }, { status: 404 })
  const eventRow = Array.isArray(score.events) ? score.events[0] : score.events
  if (eventRow?.status !== 'done') {
    return NextResponse.json({ error: 'Admin score edits are only allowed after event is done' }, { status: 409 })
  }

  const before = {
    final_overall_score: score.final_overall_score,
    final_dimension_scores: score.final_dimension_scores,
  }
  const { data: updated, error: updateError } = await db
    .from('reviewer_final_scores')
    .update(update)
    .eq('id', scoreId)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await db.from('admin_audit_log').insert({
    admin_user_id: session.userId,
    action: 'score.update_after_done',
    target_type: 'reviewer_final_scores',
    target_id: scoreId,
    before_data: before,
    after_data: update,
    metadata: { reason: body.reason ?? null },
  })

  return NextResponse.json({ score: updated })
}
