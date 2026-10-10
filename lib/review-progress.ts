type AiReview = { model?: string | null; score?: number | null; error?: boolean | null }
type AnalysisResult = { ai_reviews?: AiReview[] | null; sonar_analysis?: unknown | null; analyzed_at?: string | null; code_analysis_version?: number; github_analysis?: { llm_code_analysis?: { llm_error?: string; sampled_files?: string[] } } }

export type ReviewProgressProject = {
  id: string
  analysis_status: string | null
  analysis_result?: AnalysisResult | null
  sonar_analysis?: unknown | null
  analysis_modules?: { code?: { status?: string } } | null
}

export type ReviewProgressQueueRow = {
  project_id: string
  status: string | null
  sonar_enabled?: boolean | null
  created_at?: string | null
  started_at?: string | null
}

function successfulAiReviewCount(project: ReviewProgressProject, modelKeys?: string[]) {
  const reviews = (project.analysis_result?.ai_reviews ?? []).filter(review => !review.error && (review.score ?? 0) >= 1 && (review.score ?? 0) <= 10)
  if (modelKeys?.length) return new Set(reviews.filter(review => review.model && modelKeys.includes(review.model)).map(review => review.model)).size
  return reviews.some(review => review.model) ? new Set(reviews.map(review => review.model)).size : reviews.length
}

function projectHasSonar(project: ReviewProgressProject) {
  return Boolean(project.sonar_analysis || project.analysis_result?.sonar_analysis)
}

function projectHasCompletedAi(project: ReviewProgressProject, modelCount: number, modelKeys?: string[]) {
  return modelCount === 0 || successfulAiReviewCount(project, modelKeys) >= modelCount
}

function projectIsComplete(project: ReviewProgressProject, modelCount: number, sonarRequired: boolean, modelKeys?: string[]) {
  return projectHasCompletedAi(project, modelCount, modelKeys) && (!sonarRequired || projectHasSonar(project))
}

export function computeReviewProgress(params: {
  eventStatus: string | null
  modelCount: number
  modelKeys?: string[]
  eventSonarEnabled?: boolean | null
  projects: ReviewProgressProject[]
  queueRows: ReviewProgressQueueRow[]
}) {
  const { eventStatus, modelCount, eventSonarEnabled, projects, queueRows } = params
  const latestQueueByProject = new Map<string, ReviewProgressQueueRow>()
  for (const row of queueRows) {
    if (!latestQueueByProject.has(row.project_id)) latestQueueByProject.set(row.project_id, row)
  }

  const total = projects.length
  let completed = 0
  let failed = 0
  let active = 0

  for (const project of projects) {
    const queue = latestQueueByProject.get(project.id)
    const sonarRequired = Boolean(queue?.sonar_enabled ?? eventSonarEnabled)
    const attemptStarted = queue?.started_at || queue?.created_at
    const fresh = !attemptStarted || Boolean(project.analysis_result?.analyzed_at && project.analysis_result.analyzed_at >= attemptStarted)
    const code = project.analysis_result?.github_analysis?.llm_code_analysis
    const codeComplete = project.analysis_result?.code_analysis_version !== 2 || project.analysis_modules?.code?.status === 'skipped' || Boolean(code && !code.llm_error && code.sampled_files?.length)
    const complete = fresh && codeComplete && projectIsComplete(project, modelCount, sonarRequired, params.modelKeys)

    if (complete) {
      completed += 1
      continue
    }

    if (queue?.status === 'pending' || queue?.status === 'running') {
      active += 1
    } else if (queue?.status === 'error' || project.analysis_status === 'error') {
      failed += 1
    }
  }

  const hasQueueProgress = latestQueueByProject.size > 0
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const done = hasQueueProgress
    ? active === 0 && completed + failed >= total
    : eventStatus === 'done'

  return { total, completed, failed, active, progress, done }
}
