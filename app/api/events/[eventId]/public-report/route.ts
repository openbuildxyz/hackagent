import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params
  const db = createServiceClient()

  // Step 1: fetch event, projects, and reviewer_scores in parallel
  const [{ data: event }, { data: projects }, { data: reviewerScores }] = await Promise.all([
    db.from("events").select("id,name,track,description,dimensions,models,web3_enabled,status").eq("id", eventId).single(),
    db.from("projects").select("id,name,github_url,demo_url,description,team_name,tags").eq("event_id", eventId),
    db.from("reviewer_scores")
      .select("id,project_id,model,ai_dimension_scores,ai_overall_score,ai_comment,status")
      .eq("event_id", eventId)
      .in("status", ["ai_done", "done"]),
  ])

  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Draft / unpublished events must not expose projects or configuration publicly.
  if (!["recruiting", "hacking", "judging", "done"].includes(event.status)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Step 2: fetch legacy scores using project IDs (no subquery)
  const projectIds = (projects ?? []).map((p) => p.id)
  const { data: legacyScores } = projectIds.length > 0
    ? await db.from("scores")
        .select("id,project_id,model,dimension_scores,overall_score,comment,status")
        .in("project_id", projectIds)
        .eq("status", "done")
    : { data: [] }

  // Normalize reviewer_scores to unified format (priority)
  // Dedupe by (project_id, model) — keep first occurrence (defensive; DB may have dupes)
  const reviewerSeen = new Set<string>()
  const normalizedReviewer = (reviewerScores ?? [])
    .filter((s) => {
      const k = `${s.project_id}:${s.model}`
      if (reviewerSeen.has(k)) return false
      reviewerSeen.add(k)
      return true
    })
    .map((s) => ({
      id: s.id,
      project_id: s.project_id,
      model: s.model,
      dimension_scores: s.ai_dimension_scores,
      overall_score: s.ai_overall_score,
      comment: s.ai_comment,
      status: s.status,
    }))

  // Normalize legacy scores (fallback)
  const normalizedLegacy = (legacyScores ?? []).map((s) => ({
    id: s.id,
    project_id: s.project_id,
    model: s.model,
    dimension_scores: s.dimension_scores,
    overall_score: s.overall_score,
    comment: s.comment,
    status: s.status,
  }))

  // Merge: reviewer_scores takes priority; fill gaps with legacy scores
  const seenKeys = new Set(normalizedReviewer.map((s) => `${s.project_id}:${s.model}` ))
  const merged = [
    ...normalizedReviewer,
    ...normalizedLegacy.filter((s) => !seenKeys.has(`${s.project_id}:${s.model}`)),
  ]

  return NextResponse.json({ event, projects: projects ?? [], scores: merged })
}
