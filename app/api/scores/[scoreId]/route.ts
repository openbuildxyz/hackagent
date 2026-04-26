import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ scoreId: string }> }
) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { scoreId } = await params
  const body = await request.json()
  const { final_dimension_scores } = body as {
    final_dimension_scores: Record<string, number>
  }

  if (!final_dimension_scores || typeof final_dimension_scores !== 'object') {
    return NextResponse.json({ error: '参数错误' }, { status: 400 })
  }

  const db = createServiceClient()

  // Verify the score belongs to an event owned by the user
  const { data: score } = await db
    .from('scores')
    .select('id, project_id, projects(event_id, events(user_id, dimensions))')
    .eq('id', scoreId)
    .single()

  if (!score) {
    return NextResponse.json({ error: '评分记录不存在' }, { status: 404 })
  }

  const project = score.projects as unknown as { event_id: string; events: { user_id: string; dimensions: Array<{ name: string; weight: number }> } } | null
  if (!project?.events || project.events.user_id !== session.userId) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 })
  }

  // Calculate final_overall_score based on weights
  const dimensions = project.events.dimensions
  let final_overall_score = 0
  for (const dim of dimensions) {
    const score_val = final_dimension_scores[dim.name]
    if (typeof score_val === 'number') {
      final_overall_score += score_val * (dim.weight / 100)
    }
  }

  const { error } = await db
    .from('scores')
    .update({ final_dimension_scores, final_overall_score })
    .eq('id', scoreId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, final_overall_score })
}
