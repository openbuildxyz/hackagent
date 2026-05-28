import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'
import { analyzeWeb3 } from '@/lib/web3insight'

const DEFAULT_LIMIT = 200

type ProjectForBackfill = {
  id: string
  name: string
  github_url: string | null
  demo_url: string | null
  description: string | null
  extra_fields: Record<string, unknown> | null
  web3_analysis: Record<string, unknown> | null
  analysis_result: Record<string, unknown> | null
  analysis_log: unknown
}

function needsWeb3Backfill(project: ProjectForBackfill) {
  if (!project.github_url) return false
  const existing = project.web3_analysis ?? project.analysis_result?.web3_analysis as Record<string, unknown> | undefined
  if (!existing) return true
  const status = ((existing.web3insight as Record<string, unknown> | undefined)?.status ?? 'ok') as string
  return ['error', 'partial_error', 'not_run'].includes(status)
}

function web3Status(web3Analysis: Awaited<ReturnType<typeof analyzeWeb3>>) {
  return web3Analysis?.web3insight?.status ?? 'not_run'
}

function web3Errors(web3Analysis: Awaited<ReturnType<typeof analyzeWeb3>>) {
  return web3Analysis?.web3insight?.errors ?? []
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const body = await req.json().catch(() => ({})) as { limit?: number; projectIds?: string[] }
  const limit = Math.min(Math.max(Number(body.limit ?? DEFAULT_LIMIT), 1), 500)
  const targetProjectIds = Array.isArray(body.projectIds)
    ? body.projectIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []

  const db = createServiceClient()
  const { data: event } = await db
    .from('events')
    .select('id, user_id, web3_enabled')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const isOwner = event.user_id === session.userId
  if (!session.isAdmin && !isOwner) {
    const { data: reviewer } = await db
      .from('event_reviewers')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', session.userId)
      .single()
    if (!reviewer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let query = db
    .from('projects')
    .select('id, name, github_url, demo_url, description, extra_fields, web3_analysis, analysis_result, analysis_log')
    .eq('event_id', eventId)
    .limit(limit)

  if (targetProjectIds.length > 0) query = query.in('id', targetProjectIds)

  const { data: projects, error: projectError } = await query
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })

  const targets = ((projects ?? []) as ProjectForBackfill[]).filter(needsWeb3Backfill)
  if (targets.length === 0) {
    return NextResponse.json({ updated: 0, failed: 0, message: '没有需要补跑的 Web3Insight 数据' })
  }

  let updated = 0
  let failed = 0
  const failures: Array<{ project_id: string; name: string; error: string }> = []

  for (const project of targets) {
    try {
      const extraFields = project.extra_fields ? Object.values(project.extra_fields).join(' ') : ''
      const extraText = [project.description ?? '', project.demo_url ?? '', extraFields].join(' ')
      const analysis = await analyzeWeb3(project.github_url!, extraText)
      const now = new Date().toISOString()
      const existingResult = project.analysis_result ?? {}
      const existingLog = Array.isArray(project.analysis_log) ? project.analysis_log : []
      const status = web3Status(analysis)
      const errors = web3Errors(analysis)

      const { error } = await db
        .from('projects')
        .update({
          web3_analysis: analysis,
          analysis_result: {
            ...existingResult,
            web3_analysis: analysis,
            analyzed_at: existingResult.analyzed_at ?? now,
          },
          analysis_log: [
            ...existingLog,
            {
              ts: now,
              status: status === 'error' ? 'partial_error' : 'completed',
              mode: 'backfill',
              module: 'web3',
              web3: Boolean(analysis),
              web3_status: status,
              web3_errors: errors,
            },
          ],
        })
        .eq('id', project.id)

      if (error) throw error
      updated += 1
    } catch (err) {
      failed += 1
      failures.push({
        project_id: project.id,
        name: project.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ updated, failed, total: targets.length, failures: failures.slice(0, 10) })
}
