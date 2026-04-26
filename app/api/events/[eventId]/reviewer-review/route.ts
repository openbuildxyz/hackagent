import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { scoreProject } from '@/lib/ai'
import { buildWeb3InsightSummary } from '@/lib/web3insight'

type ProjectRow = {
  id: string
  name: string
  github_url: string | null
  demo_url: string | null
  description: string | null
  github_analysis: Record<string, unknown> | null
  web3_analysis: Record<string, unknown> | null
  sonar_analysis: Record<string, unknown> | null
  analysis_status: string | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const body = await request.json()
  const { model, dimension_prompt, project_id } = body as { model: string; dimension_prompt?: string; project_id?: string }

  if (!model) return NextResponse.json({ error: '请选择评审模型' }, { status: 400 })

  const db = createServiceClient()

  const { data: reviewer } = await db
    .from('event_reviewers')
    .select('id, custom_dimension_weights')
    .eq('event_id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!reviewer) return NextResponse.json({ error: '您不是该活动的评委' }, { status: 403 })

  const { data: event } = await db
    .from('events')
    .select('id, dimensions, web3_enabled')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: '活动不存在' }, { status: 404 })

  const { data: projects } = await db
    .from('projects')
    .select('id, name, github_url, demo_url, description, github_analysis, web3_analysis, sonar_analysis, analysis_status')
    .eq('event_id', eventId)
    .then(res => project_id ? { data: res.data?.filter(p => p.id === project_id) ?? [] } : res)

  if (!projects?.length) return NextResponse.json({ error: '该活动没有项目' }, { status: 400 })

  const rows = projects as ProjectRow[]

  // Check pre-analysis coverage: how many projects have cached data
  const analyzed = rows.filter(p => p.analysis_status === 'completed' || p.github_analysis)
  const notAnalyzed = rows.filter(p => !p.github_analysis && p.analysis_status !== 'completed')

  // Warn if none analyzed at all — block with 400 so reviewer knows
  if (analyzed.length === 0) {
    return NextResponse.json({
      error: '主办方尚未完成预分析，请联系主办方先运行"批量预分析"后再开始评审',
      hint: 'pre_analysis_required',
      total: rows.length,
      analyzed: 0,
    }, { status: 400 })
  }

  // Build dimension list using custom weights if set
  const baseDimensions = event.dimensions as Array<{ name: string; weight: number; description?: string }>
  const customWeights = reviewer.custom_dimension_weights as Array<{ name: string; weight: number }> | null
  const dimensions = customWeights
    ? baseDimensions.map(d => {
        const cw = customWeights.find(w => w.name === d.name)
        return cw ? { ...d, weight: cw.weight } : d
      })
    : baseDimensions

  const dimsWithPrompt = dimension_prompt
    ? dimensions.map(d => ({
        ...d,
        description: [d.description, dimension_prompt].filter(Boolean).join('\n补充要求：'),
      }))
    : dimensions

  const errors: string[] = []
  const skipped = 0

  for (const project of rows) {
    try {
      // Use cached github_analysis to build enriched description (no re-fetch)
      const gh = project.github_analysis as Record<string, unknown> | null
      let enrichedDescription = project.description || ''
      if (gh?.readme && typeof gh.readme === 'string' && gh.readme.length > 50) {
        enrichedDescription = gh.readme
      }

      // Build Web3Insight summary from cached web3_analysis (no re-fetch)
      let web3Summary: string | undefined
      if (event.web3_enabled && project.web3_analysis) {
        web3Summary = buildWeb3InsightSummary(project.web3_analysis as unknown as Parameters<typeof buildWeb3InsightSummary>[0])
      }

      // Extract cached sonar & code analysis
      const sonarAnalysis = project.sonar_analysis as Record<string, unknown> | null
      const codeAnalysis = gh?.llm_code_analysis as { is_real_code?: boolean; business_match_score?: number; code_quality_summary?: string } | null | undefined

      const enrichedProject = {
        id: project.id,
        name: project.name,
        github_url: project.github_url,
        demo_url: project.demo_url,
        description: enrichedDescription,
      }

      // Only LLM scoring — no GitHub/Web3/code fetches
      const result = await scoreProject(
        enrichedProject,
        dimsWithPrompt,
        model,
        event.web3_enabled ?? false,
        web3Summary,
        sonarAnalysis,
        codeAnalysis
      )

      await db.from('reviewer_scores').upsert(
        {
          event_id: eventId,
          project_id: project.id,
          reviewer_id: session.userId,
          model,
          dimension_prompt: dimension_prompt || null,
          ai_dimension_scores: result.scores,
          ai_overall_score: result.overall,
          ai_comment: result.comment,
          final_dimension_scores: result.scores,
          final_overall_score: result.overall,
          status: 'done',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,project_id,reviewer_id,model' }
      )
    } catch (err) {
      errors.push(`${project.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    success: true,
    total: rows.length,
    skipped,
    not_pre_analyzed: notAnalyzed.map(p => p.name),
    errors: errors.length ? errors : undefined,
  })
}
