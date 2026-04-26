import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  const { data: event } = await db
    .from('events')
    .select('id, user_id, dimensions, tracks')
    .eq('id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Get reviewers (accepted/active only)
  const { data: reviewerRows } = await db
    .from('event_reviewers')
    .select('user_id, invite_status')
    .eq('event_id', eventId)
    .not('user_id', 'is', null)
    .in('invite_status', ['accepted', 'active'])

  const reviewerUserIds = (reviewerRows ?? []).map(r => r.user_id as string)
  const { data: userRows } = reviewerUserIds.length > 0
    ? await db.from('users').select('id, name').in('id', reviewerUserIds)
    : { data: [] }
  const userMap: Record<string, { name: string | null }> = {}
  for (const u of userRows ?? []) userMap[u.id] = { name: (u as { id: string; name?: string | null }).name ?? null }
  const reviewers = (reviewerRows ?? []).map(r => ({
    user_id: r.user_id as string,
    name: userMap[r.user_id as string]?.name ?? null,
  }))

  // Project count
  const { count: projectCount } = await db
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  // Get all final submissions from reviewer_final_scores
  const { data: finalScores } = await db
    .from('reviewer_final_scores')
    .select('reviewer_id, project_id, final_overall_score, final_dimension_scores, projects(id, name, team_name, track_ids)')
    .eq('event_id', eventId)

  // Aggregate per project
  const projectMap: Record<string, {
    project_id: string; name: string; team_name: string | null; track_ids?: string[]
    scores: number[]; avg_score: number; reviewer_count: number
  }> = {}

  for (const s of finalScores ?? []) {
    const project = s.projects as unknown as { id: string; name: string; team_name: string | null } | null
    if (!project) continue
    if (!projectMap[s.project_id]) {
      projectMap[s.project_id] = { project_id: s.project_id, name: project.name, team_name: project.team_name, scores: [], avg_score: 0, reviewer_count: 0 }
    }
    if (typeof s.final_overall_score === 'number') {
      projectMap[s.project_id].scores.push(s.final_overall_score)
    }
  }

  const results = Object.values(projectMap).map(p => {
    const avg = p.scores.length > 0 ? p.scores.reduce((a, b) => a + b, 0) / p.scores.length : 0
    return { ...p, reviewer_count: p.scores.length, avg_score: Math.round(avg * 100) / 100 }
  })
  results.sort((a, b) => b.avg_score - a.avg_score)

  // Reviewer completion status
  const reviewerStatus = reviewers.map(r => {
    const scoredProjects = new Set(
      (finalScores ?? []).filter(s => s.reviewer_id === r.user_id).map(s => s.project_id)
    )
    const scored = scoredProjects.size
    return { user_id: r.user_id, name: r.name ?? null, scored, total: projectCount ?? 0, done: scored >= (projectCount ?? 0) && (projectCount ?? 0) > 0 }
  })

  const allDone = reviewerStatus.length > 0 && reviewerStatus.every(r => r.done)

  // Build reviewer_details: per-reviewer project scores sorted by final_overall_score desc
  const reviewerDetails: Record<string, {
    project_id: string; name: string; team_name: string | null
    final_overall_score: number | null; final_dimension_scores: Record<string, number> | null
  }[]> = {}

  for (const reviewerId of reviewerUserIds) {
    const rows = (finalScores ?? [])
      .filter(s => s.reviewer_id === reviewerId)
      .map(s => {
        const project = s.projects as unknown as { id: string; name: string; team_name: string | null } | null
        return {
          project_id: s.project_id,
          name: project?.name ?? '',
          team_name: project?.team_name ?? null,
          final_overall_score: typeof s.final_overall_score === 'number' ? s.final_overall_score : null,
          final_dimension_scores: (s.final_dimension_scores as Record<string, number> | null) ?? null,
        }
      })
    rows.sort((a, b) => (b.final_overall_score ?? -1) - (a.final_overall_score ?? -1))
    reviewerDetails[reviewerId] = rows
  }

  const eventTracks = (event as unknown as { tracks?: unknown }).tracks
  return NextResponse.json({
    reviewer_count: reviewers.length,
    project_count: projectCount ?? 0,
    all_done: allDone,
    reviewer_status: reviewerStatus,
    ranking: results,
    reviewer_details: reviewerDetails,
    tracks: Array.isArray(eventTracks) ? eventTracks : [],
  })
}
