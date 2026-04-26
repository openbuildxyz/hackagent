import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import { scoreProject, enrichProject } from '@/lib/ai'
import { deductCredits } from '@/lib/credits'

// Allow up to 5 minutes on Vercel (prevents 10 s default timeout cutting the job)
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const { eventId, models: overrideModels, sonarEnabled } = await request.json()

  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  // Validate user owns event
  const { data: event } = await db
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', session.userId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Get projects
  const { data: projects } = await db
    .from('projects')
    .select('*')
    .eq('event_id', eventId)

  if (!projects || projects.length === 0) {
    return NextResponse.json({ error: '没有项目' }, { status: 400 })
  }

  // Check credits (pre-flight check for fast UX rejection)
  const { data: user } = await db
    .from('users')
    .select('credits')
    .eq('id', session.userId)
    .single()

  const modelsToUse: string[] = Array.isArray(overrideModels) && overrideModels.length > 0 ? overrideModels : event.models
  const costPerProject = modelsToUse.length + (event.web3_enabled ? 0.5 : 0) + (sonarEnabled ? 2 : 0)
  const totalCost = Math.ceil(projects.length * costPerProject)

  if ((user?.credits ?? 0) < totalCost) {
    return NextResponse.json({ error: '积分不足' }, { status: 400 })
  }

  // Pre-deduct credits atomically BEFORE running LLM to prevent double-spend
  const preDeduct = await deductCredits(session.userId, totalCost)
  if (!preDeduct.success) {
    return NextResponse.json({ error: '积分扣除失败，请重试' }, { status: 400 })
  }

  // Mark event as judging
  await db
    .from('events')
    .update({ status: 'judging', updated_at: new Date().toISOString() })
    .eq('id', eventId)

  // Load existing done scores to skip on retry
  const { data: existingScores } = await db
    .from('scores')
    .select('project_id, model')
    .in('project_id', projects.map(p => p.id))
    .eq('status', 'done')

  const doneSet = new Set(
    (existingScores ?? []).map(s => `${s.project_id}:${s.model}`)
  )

  // Score each project with all models in parallel (5x speedup)
  for (const project of projects) {
    const modelsToRun = modelsToUse.filter(m => !doneSet.has(`${project.id}:${m}`))
    if (modelsToRun.length === 0) continue

    // Update event with current project name for progress display
    await db.from('events').update({ current_reviewing: project.name }).eq('id', eventId)

    const enrichedProject = await enrichProject({
      name: project.name,
      github_url: project.github_url,
      demo_url: project.demo_url,
      description: project.description,
    })

    await Promise.allSettled(modelsToRun.map(async (model) => {
      try {
        const result = await Promise.race([
          scoreProject(
            enrichedProject,
            event.dimensions,
            model,
            event.web3_enabled
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 90000)
          ),
        ])

        await db.from('scores').upsert(
          {
            project_id: project.id,
            model,
            dimension_scores: result.scores,
            overall_score: result.overall,
            comment: result.comment,
            web3_insight: result.web3_insight ?? null,
            status: 'done',
          },
          { onConflict: 'project_id,model', ignoreDuplicates: false }
        )
      } catch (err) {
        await db.from('scores').upsert(
          { project_id: project.id, model, status: 'failed', comment: String(err) },
          { onConflict: 'project_id,model', ignoreDuplicates: true }
        )
      }
    }))
  }

  // Count successes
  const { count: completedCount } = await db
    .from('scores')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projects.map(p => p.id))
    .eq('status', 'done')

  const completed = completedCount ?? 0

  // Atomically deduct credits (only if at least one score succeeded)
  if (completed > 0) {
    const deductResult = await deductCredits(session.userId, totalCost)
    if (!deductResult.success) {
      console.error('[review] Credits deduction failed:', deductResult.error)
    }
  }

  // Mark event as done
  await db
    .from('events')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', eventId)

  if (completed === 0) {
    return NextResponse.json({ error: '所有评审任务均失败，积分未扣除，请重试' }, { status: 500 })
  }

  // Update developer reputation asynchronously (non-blocking)
  updateReputation(db, projects).catch(e =>
    console.error('[review] reputation update failed:', e)
  )

  return NextResponse.json({ success: true, completed, total: projects.length * modelsToUse.length })
}

// ── Reputation updater ────────────────────────────────────────────────────────
async function updateReputation(
  db: ReturnType<typeof import('@/lib/supabase').createServiceClient>,
  projects: { id: string; event_id?: string }[]
) {
  for (const project of projects) {
    // Get scores for this project
    const { data: scores } = await db
      .from('scores')
      .select('overall_score')
      .eq('project_id', project.id)
      .eq('status', 'done')

    if (!scores || scores.length === 0) continue

    const scoreValues = scores
      .map(s => s.overall_score as number | null)
      .filter((s): s is number => s !== null)
    if (scoreValues.length === 0) continue

    const avgScore = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length

    // Get user email for this project (via event owner for now)
    const { data: proj } = await db
      .from('projects')
      .select('team_name, event_id')
      .eq('id', project.id)
      .single()
    if (!proj) continue

    const { data: event } = await db
      .from('events')
      .select('user_id')
      .eq('id', proj.event_id)
      .single()
    if (!event) continue

    const { data: user } = await db
      .from('users')
      .select('email')
      .eq('id', event.user_id)
      .single()
    if (!user?.email) continue

    // Upsert reputation — simple approach (no RPC needed)
    // First fetch existing to calculate rolling avg
    const { data: existing } = await db
      .from('developer_reputation')
      .select('hackathon_count, avg_score, top_score')
      .eq('email', user.email)
      .maybeSingle()

    const prevCount = existing?.hackathon_count ?? 0
    const prevAvg = existing?.avg_score ?? 0
    const prevTop = existing?.top_score ?? 0

    const newCount = prevCount + 1
    const newAvg = (prevAvg * prevCount + avgScore) / newCount
    const newTop = Math.max(prevTop, avgScore)

    await db.from('developer_reputation').upsert({
      wallet_address: user.email,
      email: user.email,
      hackathon_count: newCount,
      avg_score: Math.round(newAvg * 100) / 100,
      top_score: Math.round(newTop * 100) / 100,
      last_active: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' })
  }
}
