import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

type AiReview = { model?: string; score?: number; error?: boolean }

function avgFromAiReviews(reviews: AiReview[] | undefined): { score: number; count: number } {
  if (!Array.isArray(reviews)) return { score: 0, count: 0 }
  const vals = reviews
    .filter((r) => !r?.error && typeof r?.score === 'number' && r.score > 0)
    .map((r) => r.score as number)
  if (vals.length === 0) return { score: 0, count: 0 }
  return { score: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params
  const url = new URL(req.url)
  const limitParam = url.searchParams.get('limit')
  const sort = url.searchParams.get('sort') || ''
  const limit = Math.min(Math.max(parseInt(limitParam || '6', 10) || 6, 1), 100)

  const db = createServiceClient()

  const [{ data: event }, { data: projects }, { data: reviewerScores }] = await Promise.all([
    db.from('events').select('id, status').eq('id', eventId).is('deleted_at', null).single(),
    db
      .from('projects')
      .select('id, name, description, team_name, tags, track_ids, github_url, demo_url, logo_url, analysis_status, analysis_result, created_at')
      .eq('event_id', eventId),
    db
      .from('reviewer_scores')
      .select('project_id, model, ai_overall_score, status')
      .eq('event_id', eventId)
      .in('status', ['ai_done', 'done']),
  ])

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  // OPE-23: Draft 活动不对外公开项目列表
  if (event.status === 'draft') {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  // OPE-95: 仅在 done/judging 阶段公开项目；其余阶段返回空列表
  if (event.status !== 'done' && event.status !== 'judging') {
    return NextResponse.json({ event_status: event.status, total: 0, projects: [] })
  }

  const reviewerByProject = new Map<string, number[]>()
  for (const s of reviewerScores ?? []) {
    if (typeof s.ai_overall_score !== 'number' || s.ai_overall_score <= 0) continue
    const arr = reviewerByProject.get(s.project_id) ?? []
    arr.push(s.ai_overall_score)
    reviewerByProject.set(s.project_id, arr)
  }

  const enriched = (projects ?? []).map((p) => {
    const reviewerVals = reviewerByProject.get(p.id) ?? []
    let score = 0
    let scoreCount = 0
    if (reviewerVals.length > 0) {
      score = reviewerVals.reduce((a, b) => a + b, 0) / reviewerVals.length
      scoreCount = reviewerVals.length
    } else {
      const ar = p.analysis_result as { ai_reviews?: AiReview[] } | null
      const fromAi = avgFromAiReviews(ar?.ai_reviews)
      score = fromAi.score
      scoreCount = fromAi.count
    }
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      team_name: p.team_name,
      tags: p.tags,
      track_ids: p.track_ids,
      github_url: p.github_url,
      demo_url: p.demo_url,
      logo_url: p.logo_url,
      analysis_status: p.analysis_status,
      created_at: p.created_at,
      score: Number(score.toFixed(2)),
      score_count: scoreCount,
    }
  })

  let sorted = enriched
  if (sort === '-score') {
    sorted = [...enriched].sort((a, b) => b.score - a.score)
  } else if (sort === '-created_at') {
    sorted = [...enriched].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  }

  return NextResponse.json({
    event_status: event.status,
    total: enriched.length,
    projects: sorted.slice(0, limit),
  })
}
