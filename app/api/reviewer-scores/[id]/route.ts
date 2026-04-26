import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

// PATCH /api/reviewer-scores/[id] — override final scores for one model row
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { final_dimension_scores } = await request.json() as {
    final_dimension_scores: Record<string, number>
  }

  if (!final_dimension_scores || typeof final_dimension_scores !== 'object') {
    return NextResponse.json({ error: '参数错误' }, { status: 400 })
  }

  const db = createServiceClient()

  // Verify ownership
  const { data: row } = await db
    .from('reviewer_scores')
    .select('id, reviewer_id, event_id, events(dimensions)')
    .eq('id', id)
    .eq('reviewer_id', session.userId)
    .single()

  if (!row) return NextResponse.json({ error: '评分记录不存在或无权操作' }, { status: 404 })

  // Check not finalized
  const { data: final } = await db
    .from('reviewer_final_scores')
    .select('id')
    .eq('event_id', row.event_id)
    .eq('reviewer_id', session.userId)
    .eq('project_id', (await db.from('reviewer_scores').select('project_id').eq('id', id).single()).data?.project_id ?? '')
    .single()

  if (final) return NextResponse.json({ error: '该项目已提交最终结果，不可修改' }, { status: 409 })

  const event = row.events as unknown as { dimensions: Array<{ name: string; weight: number }> } | null
  const dimensions = event?.dimensions ?? []

  let final_overall_score = 0
  for (const dim of dimensions) {
    const val = final_dimension_scores[dim.name]
    if (typeof val === 'number') final_overall_score += val * (dim.weight / 100)
  }

  await db.from('reviewer_scores').update({
    final_dimension_scores,
    final_overall_score,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ success: true, final_overall_score })
}
