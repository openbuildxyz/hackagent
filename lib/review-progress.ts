type AiReview = { score?: number | null; error?: boolean | null }
type AnalysisResult = { ai_reviews?: AiReview[] | null; sonar_analysis?: unknown | null }

export type ReviewProgressProject = {
  id: string
  analysis_status: string | null
  analysis_result?: AnalysisResult | null
  sonar_analysis?: unknown | null
}

export type ReviewProgressQueueRow = {
  project_id: string
  status: string | null
  sonar_enabled?: boolean | null
}

function successfulAiReviewCount(project: ReviewProgressProject) {
  return (project.analysis_result?.ai_reviews ?? [])
    .filter(review => !review.error && (review.score ?? 0) > 0)
    .length
}

function projectHasSonar(project: ReviewProgressProject) {
  return Boolean(project.sonar_analysis || project.analysis_result?.sonar_analysis)
}

function projectHasCompletedAi(project: ReviewProgressProject, modelCount: number) {
  return modelCount === 0 || successfulAiReviewCount(project) >= modelCount
}

function projectIsComplete(project: ReviewProgressProject, modelCount: number, sonarRequired: boolean) {
  if (project.analysis_status === 'completed' && (!sonarRequired || projectHasSonar(project))) return true
  return projectHasCompletedAi(project, modelCount) && (!sonarRequired || projectHasSonar(project))
}

export function computeReviewProgress(params: {
  eventStatus: string | null
  modelCount: number
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
    const complete = projectIsComplete(project, modelCount, sonarRequired)

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
