import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'
import { recordAdminAction } from '@/lib/admin-audit'
import { validateProjectInput } from '@/lib/validate-project'
import { getChatConfigForModelKey } from '@/lib/zenmux'

const MAX_DESCRIPTION = 1000

type ProjectAnalysisProgress = {
  overall: 'pending' | 'running' | 'completed' | 'error' | 'partial'
  ai: {
    status: 'pending' | 'running' | 'completed' | 'error' | 'partial'
    completed: number
    total: number
  }
  sonar: {
    required: boolean
    status: 'pending' | 'running' | 'completed' | 'error' | 'skipped'
  }
  queue: {
    status: string | null
    error: string | null
    sonar_enabled: boolean
  }
}

type ProjectForProgress = {
  id: string
  analysis_status: string | null
  analysis_result?: {
    ai_reviews?: Array<{ model?: string | null; score?: number | null; error?: boolean | null }> | null
    sonar_analysis?: unknown | null
  } | null
  sonar_analysis?: unknown | null
}

type ScoreRow = { project_id: string; model: string | null }
type QueueRow = { project_id: string; status: string | null; error: string | null; sonar_enabled: boolean | null }

function buildAnalysisProgress(
  projects: ProjectForProgress[],
  event: { models: unknown; sonar_enabled?: boolean | null },
  scoreRows: ScoreRow[],
  queueRows: QueueRow[]
): Record<string, ProjectAnalysisProgress> {
  const models = Array.isArray(event.models) ? event.models.filter((m): m is string => typeof m === 'string') : []
  const requiredModelCount = models.length
  const completedByProject = new Map<string, Set<string>>()
  for (const row of scoreRows) {
    if (!row.model) continue
    const set = completedByProject.get(row.project_id) ?? new Set<string>()
    set.add(row.model)
    completedByProject.set(row.project_id, set)
  }

  const latestQueueByProject = new Map<string, QueueRow>()
  for (const row of queueRows) {
    if (!latestQueueByProject.has(row.project_id)) latestQueueByProject.set(row.project_id, row)
  }

  const progress: Record<string, ProjectAnalysisProgress> = {}
  for (const project of projects) {
    const queue = latestQueueByProject.get(project.id)
    const queueStatus = queue?.status ?? null
    const queueError = queue?.error ?? null
    const completedModels = completedByProject.get(project.id)
    const aiReviewModels = new Set(
      (project.analysis_result?.ai_reviews ?? [])
        .filter(review => !review.error && (review.score ?? 0) > 0 && review.model)
        .map(review => review.model as string)
    )
    const aiCompleted = completedModels?.size ?? aiReviewModels.size
    const sonarRequired = Boolean(event.sonar_enabled || queue?.sonar_enabled)
    const sonarCompleted = Boolean(project.sonar_analysis || project.analysis_result?.sonar_analysis)

    let aiStatus: ProjectAnalysisProgress['ai']['status'] = 'pending'
    if (requiredModelCount === 0) aiStatus = 'completed'
    else if (aiCompleted >= requiredModelCount) aiStatus = 'completed'
    else if (queueStatus === 'error' || project.analysis_status === 'error') aiStatus = aiCompleted > 0 ? 'partial' : 'error'
    else if (queueStatus === 'running' || project.analysis_status === 'running') aiStatus = 'running'
    else if (aiCompleted > 0) aiStatus = 'partial'

    let sonarStatus: ProjectAnalysisProgress['sonar']['status'] = 'skipped'
    if (sonarRequired) {
      if (sonarCompleted) sonarStatus = 'completed'
      else if (queueStatus === 'error' || project.analysis_status === 'error') sonarStatus = 'error'
      else if (queueStatus === 'running' || project.analysis_status === 'running') sonarStatus = 'running'
      else sonarStatus = 'pending'
    }

    const complete = aiStatus === 'completed' && (!sonarRequired || sonarStatus === 'completed')
    // Sonar is a supplementary code-quality signal. If AI judging is complete,
    // a Sonar failure should not mark the whole project as "分析异常"; show it as
    // partial with the Sonar detail instead.
    const failed = aiStatus === 'error' || (sonarStatus === 'error' && aiStatus !== 'completed')
    const running = aiStatus === 'running' || sonarStatus === 'running'
    const partial = aiStatus === 'partial' || (sonarRequired && aiStatus === 'completed' && sonarStatus !== 'completed')
    const overall: ProjectAnalysisProgress['overall'] = complete
      ? 'completed'
      : failed
      ? 'error'
      : running
      ? 'running'
      : partial
      ? 'partial'
      : 'pending'

    progress[project.id] = {
      overall,
      ai: { status: aiStatus, completed: aiCompleted, total: requiredModelCount },
      sonar: { required: sonarRequired, status: sonarStatus },
      queue: { status: queueStatus, error: queueError, sonar_enabled: Boolean(queue?.sonar_enabled) },
    }
  }
  return progress
}

// demo_url is optional; bulk-imported sheets often put non-URL text here
// ("coming soon", "N/A", a note). Keep a valid normalized URL, otherwise drop
// it so one bad optional cell doesn't fail the whole import.
function cleanOptionalUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  let u = raw.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return u
  } catch { /* fall through */ }
  return undefined
}

// Condense an over-length description to <= MAX_DESCRIPTION chars via AI,
// preserving key technical/product details. Falls back to a hard truncate if
// the AI call fails or is misconfigured so bulk import never breaks on this.
async function summarizeDescription(text: string): Promise<string> {
  const { apiUrl, apiKey } = getChatConfigForModelKey('minimax')
  if (!apiKey) return text.slice(0, MAX_DESCRIPTION)
  try {
    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'minimax-m2.5',
        temperature: 0.2,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Summarize the following hackathon project description to at most ${MAX_DESCRIPTION} characters, in the same language as the input, preserving key technical and product details. Output only the summary text, no preamble.\n\n${text}`,
        }],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return text.slice(0, MAX_DESCRIPTION)
    const data = await res.json()
    const summary = String(data?.choices?.[0]?.message?.content ?? '').trim()
    return summary ? summary.slice(0, MAX_DESCRIPTION) : text.slice(0, MAX_DESCRIPTION)
  } catch {
    return text.slice(0, MAX_DESCRIPTION)
  }
}

function cleanTags(raw: unknown): string[] {
  if (!raw) return []
  const str = Array.isArray(raw) ? (raw as string[]).join(',') : String(raw)
  return str
    .split(/[,;|]/)
    .map(t => t.trim())
    .filter(t => {
      if (!t || t.length < 2) return false
      const lower = t.toLowerCase()
      if (lower.includes('grand prize')) return false
      if (lower.includes('track prize')) return false
      if (lower.includes('prize:')) return false
      if (lower.includes('winner')) return false
      if (lower.startsWith('prize')) return false
      if (lower.startsWith('best ') && lower.length > 20) return false
      if (lower.includes('incubation')) return false
      if (lower.includes('community choice')) return false
      return true
    })
    .slice(0, 5)
}

// GET /api/events/[id]/projects
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  // OPE-25: admin bypass — 任意活动可读项目；否则必须是 owner 或 reviewer
  if (!session.isAdmin) {
    const { data: event } = await db.from('events').select('id').eq('id', eventId).eq('user_id', session.userId).single()
    const { data: reviewer } = event ? { data: null } : await db.from('event_reviewers').select('event_id').eq('event_id', eventId).eq('user_id', session.userId).single()
    if (!event && !reviewer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } else {
    const { data: event } = await db.from('events').select('id').eq('id', eventId).is('deleted_at', null).maybeSingle()
    if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: projects } = await db
    .from('projects')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (!projects?.length) return NextResponse.json(projects ?? [])

  const { data: eventConfig } = await db
    .from('events')
    .select('models, sonar_enabled')
    .eq('id', eventId)
    .single()

  const projectIds = projects.map(p => p.id)
  const [{ data: reviewerScores }, { data: legacyScores }, { data: queueRows }] = await Promise.all([
    db.from('reviewer_scores').select('project_id, model').in('project_id', projectIds).in('status', ['done', 'ai_done']),
    db.from('scores').select('project_id, model').in('project_id', projectIds).eq('status', 'done'),
    db.from('analysis_queue')
      .select('project_id, status, error, sonar_enabled')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
  ])

  const progress = buildAnalysisProgress(
    projects as ProjectForProgress[],
    eventConfig ?? { models: [], sonar_enabled: false },
    ([...(reviewerScores ?? []), ...(legacyScores ?? [])] as ScoreRow[]),
    (queueRows ?? []) as QueueRow[]
  )

  return NextResponse.json(projects.map(project => ({
    ...project,
    analysis_progress: progress[project.id],
  })))
}

// POST /api/events/[id]/projects - import projects into an event
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  const body = await request.json()

  // Participant submission flow: single project linked to an approved registration
  // Does NOT require event ownership — registration ownership is verified instead
  if ('registration_id' in body) {
    const { registration_id, name, github_url, demo_url, description, team_name, track_ids, team_id } = body as {
      registration_id: string
      name?: string
      github_url?: string
      demo_url?: string
      description?: string
      team_name?: string
      track_ids?: string[]
      team_id?: string
    }

    // Verify registration belongs to current user, is for this event, and is approved
    const { data: reg } = await db
      .from('registrations')
      .select('id, status, team_name, project_id')
      .eq('id', registration_id)
      .eq('event_id', eventId)
      .eq('user_id', session.userId)
      .single()

    if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    if (reg.status === 'pending') return NextResponse.json({ error: 'Your registration is still pending approval. Please wait for the organizer to approve your registration before submitting a project.' }, { status: 403 })
    if (reg.status === 'rejected') return NextResponse.json({ error: 'Your registration was not approved. You cannot submit a project.' }, { status: 403 })
    if (reg.status !== 'approved') return NextResponse.json({ error: 'Registration not approved' }, { status: 403 })
    if (reg.project_id) return NextResponse.json({ error: 'Project already submitted', project_id: reg.project_id }, { status: 409 })

    const v = validateProjectInput({ name, github_url, description, demo_url, team_name })
    if (!v.ok) {
      return NextResponse.json({ error: 'Validation failed', details: v.errors }, { status: 400 })
    }

    const { data: project, error: projErr } = await db
      .from('projects')
      .insert({
        event_id: eventId,
        name: v.sanitized.name,
        github_url: v.sanitized.github_url,
        demo_url: v.sanitized.demo_url,
        description: v.sanitized.description,
        team_name: v.sanitized.team_name ?? (reg.team_name ?? null),
        track_ids: Array.isArray(track_ids) && track_ids.length > 0 ? track_ids : [],
        registration_id,
        team_id: team_id || null,
        status: 'pending',
      })
      .select('id, name')
      .single()

    if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 })

    // Link project to registration
    await db.from('registrations').update({ project_id: project.id }).eq('id', registration_id)

    return NextResponse.json({ project })
  }

  // Admin bulk import flow — requires event ownership (OPE-25: admin bypass)
  if (!session.isAdmin) {
    const { data: event } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('user_id', session.userId)
      .single()
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
  } else {
    const { data: event } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
  }

  const { projects } = body as { projects: unknown[] }

  if (!Array.isArray(projects) || projects.length === 0) {
    return NextResponse.json({ error: 'projects 不能为空' }, { status: 400 })
  }
  if (projects.length > 500) {
    return NextResponse.json({ error: '单次最多导入 500 个项目' }, { status: 400 })
  }

  // Validate and normalize each project
  type ProjectInput = {
    name?: unknown
    github_url?: unknown
    description?: unknown
    demo_url?: unknown
    team_name?: unknown
    tags?: unknown
    track_ids?: unknown
    extra_fields?: unknown
  }

  const validated: { name: string; github_url: string; description: string; demo_url: string | null; team_name: string | null; tags: string[] | null; track_ids: string[]; extra_fields: Record<string, string> | null; event_id: string }[] = []
  const errors: string[] = []

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i] as ProjectInput
    // Bulk imports pull descriptions from external sources that often exceed the
    // limit; AI-summarize over-length ones instead of failing the whole batch.
    let description = p.description
    if (typeof description === 'string') {
      const trimmed = description.trim()
      description = trimmed.length > MAX_DESCRIPTION ? await summarizeDescription(trimmed) : trimmed
    }
    const v = validateProjectInput({
      name: p.name,
      github_url: p.github_url,
      description,
      demo_url: cleanOptionalUrl(p.demo_url),
      team_name: p.team_name,
    })
    if (!v.ok) {
      const label = typeof p.name === 'string' && p.name.trim() ? `（${p.name}）` : ''
      const detail = Object.entries(v.errors).map(([k, m]) => `${k}: ${m}`).join('; ')
      errors.push(`第 ${i + 1} 行${label}：${detail}`)
      continue
    }
    validated.push({
      event_id: eventId,
      name: v.sanitized.name,
      github_url: v.sanitized.github_url,
      description: v.sanitized.description,
      demo_url: v.sanitized.demo_url,
      team_name: v.sanitized.team_name,
      tags: cleanTags(p.tags).length > 0 ? cleanTags(p.tags) : null,
      track_ids: Array.isArray(p.track_ids) ? (p.track_ids as string[]).filter(Boolean) : (typeof p.track_ids === 'string' && (p.track_ids as string).trim() ? [(p.track_ids as string).trim()] : []),
      extra_fields: p.extra_fields && typeof p.extra_fields === 'object' && !Array.isArray(p.extra_fields)
        ? p.extra_fields as Record<string, string>
        : null,
    })
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: '格式校验失败', details: errors }, { status: 400 })
  }

  // Resolve track_ids: map track names to track IDs where needed
  const { data: eventData } = await db.from('events').select('tracks').eq('id', eventId).single()
  const eventTracks: Array<{ id: string; name: string }> = Array.isArray(eventData?.tracks) ? eventData.tracks : []
  for (const p of validated) {
    if (p.track_ids.length > 0 && eventTracks.length > 0) {
      p.track_ids = p.track_ids.map(tid => {
        if (/^[0-9a-f-]{36}$/i.test(tid) || eventTracks.some(tr => tr.id === tid)) return tid
        const lower = tid.toLowerCase()
        const matched = eventTracks.find(tr =>
          tr.name.toLowerCase() === lower ||
          tr.name.toLowerCase().includes(lower) ||
          lower.includes(tr.name.toLowerCase())
        )
        return matched ? matched.id : tid
      }).filter(Boolean)
    }
  }

  // OPE-50: description fields are stored as-is. No server-side fetching of
  // user-supplied URLs — even allowlisted hosts are an SSRF foothold we don't
  // need. Organizers can paste the scraped text directly if they want
  // enrichment.

  // Duplicate detection: fetch existing names for this event
  const { data: existing } = await db
    .from('projects')
    .select('name')
    .eq('event_id', eventId)

  const existingNames = new Set((existing ?? []).map(p => p.name.toLowerCase()))
  const toInsert = validated.filter(p => !existingNames.has(p.name.toLowerCase()))
  const skipped = validated.length - toInsert.length

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, message: '所有项目均已存在，无新项目导入' })
  }

  const { data: inserted, error: insertError } = await db
    .from('projects')
    .insert(toInsert)
    .select('id, name')

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    inserted: inserted?.length ?? 0,
    skipped,
    projects: inserted,
  })
}

// DELETE /api/events/[eventId]/projects
// body: { ids: string[] } | { ids: 'all' }
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const db = createServiceClient()

  // OPE-25: admin bypass — 任意活动可清项目；否则必须是 owner
  const { data: event } = await db
    .from('events')
    .select('id, user_id')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const isOwner = event.user_id === session.userId
  if (!isOwner && !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json() as { ids: string[] | 'all' }
  const { ids } = body

  if (!ids) return NextResponse.json({ error: 'ids required' }, { status: 400 })

  let query = db.from('projects').delete().eq('event_id', eventId)
  if (ids !== 'all') {
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be non-empty array or "all"' }, { status: 400 })
    }
    query = query.in('id', ids)
  }

  const { error, count } = await query.select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (session.isAdmin && !isOwner) {
    await recordAdminAction({
      adminUserId: session.userId,
      action: 'project.delete',
      target_type: 'project',
      target_id: null,
      metadata: { event_id: eventId, owner_user_id: event.user_id, ids, count: count ?? 0 },
    })
  }

  return NextResponse.json({ deleted: count ?? ids === 'all' ? '全部' : ids.length })
}
