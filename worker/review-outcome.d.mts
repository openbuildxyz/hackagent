export function persistedReviewComplete(project: {
  analysis_result?: Record<string, unknown> | null
  analysis_modules?: Record<string, unknown> | null
  sonar_analysis?: unknown
} | null | undefined, job: {
  started_at?: string | null
  created_at?: string | null
  run_mode?: string | null
  run_module?: string | null
  models?: unknown
  sonar_enabled?: boolean | null
}): boolean
