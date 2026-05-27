import { computeReviewProgress } from '../lib/review-progress.ts'

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`FAIL: ${message}`)
    console.error('actual:  ', actual)
    console.error('expected:', expected)
    process.exit(1)
  }
}

const models = ['claude', 'minimax', 'gemini', 'gpt4o', 'deepseek', 'kimi', 'glm']
const doneReviews = models.map((_, index) => ({ score: index + 1, error: false }))

assertEqual(
  computeReviewProgress({
    eventStatus: 'judging',
    modelCount: models.length,
    eventSonarEnabled: true,
    projects: [
      { id: 'completed-with-stale-error', analysis_status: 'completed', analysis_result: { ai_reviews: doneReviews }, sonar_analysis: { ok: true } },
      { id: 'pending-but-fully-done', analysis_status: 'pending', analysis_result: { ai_reviews: doneReviews, sonar_analysis: { ok: true } } },
      { id: 'sonar-failed', analysis_status: 'pending', analysis_result: { ai_reviews: doneReviews } },
    ],
    queueRows: [
      { project_id: 'completed-with-stale-error', status: 'error', sonar_enabled: true },
      { project_id: 'pending-but-fully-done', status: 'done', sonar_enabled: true },
      { project_id: 'sonar-failed', status: 'error', sonar_enabled: true },
    ],
  }),
  { total: 3, completed: 2, failed: 1, active: 0, progress: 67, done: true },
  'project-derived completion should override stale aggregate status and stale queue errors'
)

assertEqual(
  computeReviewProgress({
    eventStatus: 'judging',
    modelCount: models.length,
    eventSonarEnabled: true,
    projects: [
      { id: 'one', analysis_status: 'pending', analysis_result: { ai_reviews: doneReviews, sonar_analysis: { ok: true } } },
      { id: 'two', analysis_status: 'running', analysis_result: { ai_reviews: doneReviews, sonar_analysis: { ok: true } } },
    ],
    queueRows: [
      { project_id: 'one', status: 'done', sonar_enabled: true },
      { project_id: 'two', status: 'done', sonar_enabled: true },
    ],
  }),
  { total: 2, completed: 2, failed: 0, active: 0, progress: 100, done: true },
  'fully completed modules should not leave review page stuck in judging'
)

console.log('review progress tests passed')
