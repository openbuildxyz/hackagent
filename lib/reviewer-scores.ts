type AiReview = {
  model: string
  score: number
  dimensions?: Record<string, number>
  summary?: string | { zh?: string; en?: string }
  error?: boolean
}

type AnalysisResult = {
  ai_reviews?: AiReview[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initReviewerScores(db: any, eventId: string, userId: string): Promise<void> {
  try {
    const { data: projects } = await db
      .from('projects')
      .select('id, analysis_result')
      .eq('event_id', eventId)

    if (!projects?.length) return

    const { data: event } = await db
      .from('events')
      .select('models')
      .eq('id', eventId)
      .single()

    const models: string[] = (event?.models as string[] | null) ?? ['claude', 'minimax', 'gemini', 'gpt4o', 'deepseek', 'kimi', 'glm']

    const { data: existing } = await db
      .from('reviewer_scores')
      .select('project_id, model')
      .eq('event_id', eventId)
      .eq('reviewer_id', userId)

    const existingSet = new Set<string>()
    for (const e of (existing ?? []) as Array<{ project_id: string; model: string }>) {
      existingSet.add(`${e.project_id}:${e.model}`)
    }

    const inserts: Array<Record<string, unknown>> = []
    for (const project of projects as Array<{ id: string; analysis_result: unknown }>) {
      const ar = project.analysis_result as AnalysisResult | null
      const aiReviews = ar?.ai_reviews ?? []

      for (const model of models) {
        if (existingSet.has(`${project.id}:${model}`)) continue

        const aiReview = aiReviews.find(r => r.model === model && !r.error && (r.score ?? 0) > 0)
        if (aiReview) {
          const raw = aiReview.summary
          const ai_comment = raw && typeof raw === 'object'
            ? (raw.zh ?? raw.en ?? null)
            : (raw ?? null)

          inserts.push({
            event_id: eventId,
            project_id: project.id,
            reviewer_id: userId,
            model,
            ai_dimension_scores: aiReview.dimensions ?? null,
            ai_overall_score: aiReview.score,
            ai_comment,
            status: 'ai_done',
          })
        } else {
          inserts.push({
            event_id: eventId,
            project_id: project.id,
            reviewer_id: userId,
            model,
            ai_dimension_scores: null,
            ai_overall_score: null,
            ai_comment: null,
            status: 'pending',
          })
        }
      }
    }

    if (!inserts.length) return

    const BATCH = 50
    for (let i = 0; i < inserts.length; i += BATCH) {
      await db.from('reviewer_scores').insert(inserts.slice(i, i + BATCH))
    }
  } catch (err) {
    console.error('[initReviewerScores] error:', err)
  }
}
