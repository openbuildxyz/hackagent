/** Completion follows persisted evidence for this attempt, not transport status. */
export function persistedReviewComplete(project, job) {
  if (!project) return false
  const since = job.started_at || job.created_at
  if (job.run_mode === 'rerun_module' && job.run_module === 'sonar') {
    const sonar = project.analysis_modules?.sonar
    return sonar?.status === 'completed' && (!since || sonar.updated_at >= since)
      && Boolean(project.sonar_analysis || project.analysis_result?.sonar_analysis)
  }
  const result = project.analysis_result
  if (!result || (since && (!result.analyzed_at || result.analyzed_at < since))) return false
  const models = Array.isArray(job.models) ? job.models : []
  if (!models.length || !models.every(model => (result.ai_reviews || []).some(review =>
    review.model === model && !review.error && Number.isFinite(review.score) && review.score >= 1 && review.score <= 10))) return false
  if (result.code_analysis_version === 2 && project.analysis_modules?.code?.status !== 'skipped') {
    const code = result.github_analysis?.llm_code_analysis
    if (!code || code.llm_error || !code.sampled_files?.length || !code.source_digest) return false
  }
  return !job.sonar_enabled || Boolean(project.sonar_analysis || result.sonar_analysis)
}
