'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  ArrowLeft, Play, CheckCircle2, Loader2,
  Brain, Settings2, Send, AlertTriangle,
} from 'lucide-react'
import { MODEL_NAMES } from '@/lib/models'
import { useT } from '@/lib/i18n'
import ProjectsTable from '../ProjectsTable'

type EventData = {
  id: string; name: string; track: string | null
  models: string[]; dimensions: Array<{ name: string; weight: number; description?: string }>
  web3_enabled: boolean; mode: string
}
type AnalysisResult = {
  ai_reviews?: Array<{ model: string; score: number; dimensions?: Record<string, number>; summary?: string; error?: boolean }>
  github_analysis?: { stars?: number; forks?: number; contributors_count?: number; commit_count_30d?: number; fake_code_flags?: string[]; languages?: Record<string, { pct: number }>; has_readme?: boolean; has_tests?: boolean }
  web3_analysis?: { web3insight?: { total_score?: number; top_ecosystem?: string; ecosystems?: Array<{ name: string; score: number }>; is_web3_developer?: boolean }; contributors?: Array<{ username: string; web3_score?: number; is_web3_dev?: boolean; top_eco?: string }> }
  sonar_analysis?: { status?: string; metrics?: { bugs?: string|number; vulnerabilities?: string|number; code_smells?: string|number; ncloc?: string|number; duplicated_lines_density?: string|number; reliability_rating?: string; security_rating?: string; sqale_rating?: string }; size_mb?: number }
}
type Project = {
  id: string; name: string; github_url: string | null
  demo_url: string | null; description: string | null; team_name: string | null
  analysis_result?: AnalysisResult | null
}
type ReviewerScore = {
  id: string; project_id: string; model: string; dimension_prompt?: string
  ai_dimension_scores: Record<string, number> | null
  ai_overall_score: number | null; ai_comment: string | null
  final_dimension_scores: Record<string, number> | null
  final_overall_score: number | null; status: string; project: Project
}
type FinalScore = {
  project_id: string; final_overall_score: number
  final_dimension_scores: Record<string, number>
  source: string; selected_models?: string[]; submitted_at: string
}
type ScoreMap = Record<string, Record<string, ReviewerScore>>
type PendingSub = { source: string; selected_models?: string[]; final_dimension_scores: Record<string, number>; final_overall_score: number }

export default function ReviewerPage() {
  const params = useParams()
  const eventId = params.id as string
  const router = useRouter()
  const t = useT()

  const [event, setEvent] = useState<EventData | null>(null)
  const [scoreMap, setScoreMap] = useState<ScoreMap>({})
  const [projects, setProjects] = useState<Project[]>([])
  const [finalScores, setFinalScores] = useState<FinalScore[]>([])
  const [customWeights, setCustomWeights] = useState<Array<{ name: string; weight: number }> | null>(null)
  const [loading, setLoading] = useState(true)
  const [tableKey, setTableKey] = useState(0)

  const [selectedModel, setSelectedModel] = useState('')
  const [dimensionPrompt, setDimensionPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [showPromptBox, setShowPromptBox] = useState(false)

  const [editWeights, setEditWeights] = useState(false)
  const [draftWeights, setDraftWeights] = useState<Array<{ name: string; weight: number }>>([])
  const [savingWeights, setSavingWeights] = useState(false)

  const [editTarget, setEditTarget] = useState<{ projectId: string; selectedModel: string; dims: Record<string, number> } | null>(null)
  const [saving, setSaving] = useState(false)

  const [submitDialog, setSubmitDialog] = useState(false)
  const [pendingSubmissions, setPendingSubmissions] = useState<Record<string, PendingSub>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({})

  const [preAnalysisRequired, setPreAnalysisRequired] = useState(false)
  const [runProgress, setRunProgress] = useState<{ done: number; total: number } | null>(null)

  const load = useCallback(async () => {
    const [evRes, scRes] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch(`/api/events/${eventId}/reviewer-scores`),
    ])
    if (!evRes.ok) { router.push('/dashboard'); return }
    if (scRes.status === 403) { toast.error(t('reviewerPage.notReviewer')); router.push('/dashboard'); return }
    if (scRes.status === 401) { router.push('/login'); return }

    const evData: EventData = await evRes.json()
    const { scores, finalScores: finals, customWeights: cw } = await scRes.json()

    const map: ScoreMap = {}
    const projectList: Project[] = []
    const seen = new Set<string>()
    for (const s of (scores ?? []) as ReviewerScore[]) {
      if (!map[s.project_id]) map[s.project_id] = {}
      map[s.project_id][s.model] = s
      if (!seen.has(s.project_id)) {
        seen.add(s.project_id)
        projectList.push(s.project)
      }
    }
    setEvent(evData)
    setProjects(projectList)
    setScoreMap(map)
    setFinalScores(finals ?? [])
    setCustomWeights(cw)
    if (!selectedModel && evData.models.length) setSelectedModel(evData.models[0])
    setLoading(false)
  }, [eventId, router, selectedModel, t])

  useEffect(() => { load() }, [load])

  const effectiveDims = useCallback((ev: EventData) => {
    if (!customWeights) return ev.dimensions
    return ev.dimensions.map(d => {
      const cw = customWeights.find(w => w.name === d.name)
      return cw ? { ...d, weight: cw.weight } : d
    })
  }, [customWeights])

  const computeWeighted = useCallback((dims: Record<string, number>, ev: EventData) =>
    effectiveDims(ev).reduce((s, d) => s + (dims[d.name] ?? 0) * (d.weight / 100), 0),
  [effectiveDims])

  const handleRunAI = async () => {
    if (!event || !selectedModel) return
    setRunning(true)
    setRunProgress(null)
    try {
      const projectsRes = await fetch(`/api/events/${eventId}/projects`)
      const allProjects: Array<{ id: string }> = await projectsRes.json()
      const total = allProjects.length
      setRunProgress({ done: 0, total })

      let successCount = 0
      let hasPreAnalysisError = false

      for (const p of allProjects) {
        try {
          const res = await fetch(`/api/events/${eventId}/reviewer-review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: selectedModel, dimension_prompt: dimensionPrompt || undefined, project_id: p.id }),
            signal: AbortSignal.timeout(60_000),
          })
          const data = await res.json()
          if (!res.ok) {
            if (data.hint === 'pre_analysis_required') hasPreAnalysisError = true
          } else {
            successCount++
          }
        } catch { /* continue */ }
        setRunProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null)
      }

      if (hasPreAnalysisError) setPreAnalysisRequired(true)
      if (successCount > 0) {
        toast.success(`AI ${t('reviewerPage.running')}，${successCount}/${total}`)
        await load()
        setTableKey(k => k + 1)
      } else {
        toast.error(t('reviewerPage.preAnalysisWarning'))
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : t('common.analysisFailed')) }
    finally { setRunning(false); setRunProgress(null) }
  }

  const handleSaveWeights = async () => {
    if (!event) return
    const total = draftWeights.reduce((s, d) => s + d.weight, 0)
    if (Math.abs(total - 100) > 1) { toast.error(`${t('common.weightMustBe100')} ${total}%`); return }
    setSavingWeights(true)
    try {
      const res = await fetch(`/api/events/${eventId}/reviewer-scores`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_dimension_weights: draftWeights }),
      })
      if (!res.ok) throw new Error(t('common.saveFailed'))
      setCustomWeights(draftWeights)
      setEditWeights(false)
      toast.success(t('reviewerPage.aiControl.customWeightsActive'))
    } catch (err) { toast.error(String(err)) }
    finally { setSavingWeights(false) }
  }

  const openAdjustDialog = useCallback((projectId: string, defaultModel?: string) => {
    if (!event) return
    const ps = scoreMap[projectId]
    if (!ps || !Object.keys(ps).length) return
    const model = (defaultModel && ps[defaultModel]) ? defaultModel : Object.keys(ps)[0]
    const score = ps[model]
    const dims: Record<string, number> = {}
    for (const d of event.dimensions) {
      dims[d.name] = score.final_dimension_scores?.[d.name] ?? score.ai_dimension_scores?.[d.name] ?? 5
    }
    setEditTarget({ projectId, selectedModel: model, dims })
  }, [event, scoreMap])

  const handleAdjustScore = useCallback((projectId: string, model: string) => {
    openAdjustDialog(projectId, model)
  }, [openAdjustDialog])

  const handleSaveScore = async () => {
    if (!editTarget || !event) return
    const score = scoreMap[editTarget.projectId]?.[editTarget.selectedModel]
    if (!score) return
    setSaving(true)
    try {
      const res = await fetch(`/api/reviewer-scores/${score.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_dimension_scores: editTarget.dims }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('common.saveFailed'))
      setScoreMap(prev => ({
        ...prev,
        [editTarget.projectId]: {
          ...prev[editTarget.projectId],
          [editTarget.selectedModel]: {
            ...score,
            final_dimension_scores: editTarget.dims,
            final_overall_score: data.final_overall_score,
          },
        },
      }))
      toast.success(t('editScore.save'))
      setEditTarget(null)
      setTableKey(k => k + 1)
    } catch (err) { toast.error(err instanceof Error ? err.message : t('common.saveFailed')) }
    finally { setSaving(false) }
  }

  const submittedProjectIds = useMemo(
    () => new Set(finalScores.map(f => f.project_id)),
    [finalScores]
  )

  const openSubmitDialog = useCallback(() => {
    if (!event) return
    const pending: Record<string, PendingSub> = {}
    for (const project of projects) {
      if (submittedProjectIds.has(project.id)) continue
      const ps = scoreMap[project.id] ?? {}
      const models = Object.keys(ps)
      if (!models.length) continue
      const allDims: Record<string, number> = {}
      for (const d of event.dimensions) {
        const vals = models
          .map(m => ps[m]?.final_dimension_scores?.[d.name] ?? ps[m]?.ai_dimension_scores?.[d.name] ?? 0)
          .filter(v => v > 0)
        allDims[d.name] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      }
      pending[project.id] = {
        source: models.length === 1 ? `model:${models[0]}` : 'average',
        selected_models: models,
        final_dimension_scores: allDims,
        final_overall_score: computeWeighted(allDims, event),
      }
    }
    setPendingSubmissions(pending)
    setSubmitErrors({})
    setSubmitDialog(true)
  }, [event, projects, scoreMap, computeWeighted, submittedProjectIds])

  const handleSubmitProject = useCallback((projectId: string) => {
    if (!event) return
    const ps = scoreMap[projectId] ?? {}
    const models = Object.keys(ps)
    if (!models.length) return
    const allDims: Record<string, number> = {}
    for (const d of event.dimensions) {
      const vals = models
        .map(m => ps[m]?.final_dimension_scores?.[d.name] ?? ps[m]?.ai_dimension_scores?.[d.name] ?? 0)
        .filter(v => v > 0)
      allDims[d.name] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }
    setPendingSubmissions({
      [projectId]: {
        source: models.length === 1 ? `model:${models[0]}` : 'average',
        selected_models: models,
        final_dimension_scores: allDims,
        final_overall_score: computeWeighted(allDims, event),
      },
    })
    setSubmitErrors({})
    setSubmitDialog(true)
  }, [event, scoreMap, computeWeighted])

  const handleFinalSubmit = async () => {
    setSubmitting(true)
    const newErrors: Record<string, string> = {}
    let successCount = 0
    for (const [project_id, sub] of Object.entries(pendingSubmissions)) {
      try {
        const res = await fetch(`/api/events/${eventId}/reviewer-submit`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissions: [{ project_id, ...sub }] }),
        })
        const data = await res.json()
        if (!res.ok) {
          newErrors[project_id] = data.error || t('common.submitFailed')
        } else {
          successCount++
        }
      } catch (err) {
        newErrors[project_id] = err instanceof Error ? err.message : t('common.submitFailed')
      }
    }
    setSubmitErrors(newErrors)
    setSubmitting(false)
    if (successCount > 0) {
      toast.success(`${t('submitDialog.confirm')} ${successCount}`)
      await load()
      setTableKey(k => k + 1)
    }
    if (Object.keys(newErrors).length === 0) {
      setSubmitDialog(false)
    }
  }

  // Map projects + scoreMap → ProjectsTable Project format
  const projectsForTable = useMemo(() => {
    return projects.map(p => {
      const ps = scoreMap[p.id] ?? {}
      const reviewerSubs = Object.values(ps)
        .filter(s => (s.final_overall_score ?? s.ai_overall_score) != null)
        .map(s => ({
          model: s.model,
          score: s.final_overall_score ?? s.ai_overall_score ?? 0,
          dimensions: s.final_dimension_scores ?? s.ai_dimension_scores ?? {},
          summary: s.ai_comment ?? undefined,
        }))
      return {
        id: p.id,
        name: p.name,
        github_url: p.github_url,
        demo_url: p.demo_url,
        pitch_url: null as string | null,
        team_name: p.team_name,
        tags: null as string[] | null,
        status: 'completed',
        analysis_status: 'completed' as string | null,
        extra_fields: null as Record<string, string> | null,
        description: p.description,
        analysis_result: p.analysis_result ?? null,
        reviewer_submissions: reviewerSubs,
      }
    })
  }, [projects, scoreMap])

  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="animate-spin text-blue-600 mx-auto mb-3" size={32} />
        <p className="text-fg-muted text-sm">{t('reviewerPage.loading')}</p>
      </div>
    </div>
  )
  if (!event) return null

  const finalMap = Object.fromEntries(finalScores.map(f => [f.project_id, f]))
  void finalMap
  const submittedCount = finalScores.length
  const totalProjects = projects.length
  const allSubmitted = submittedCount >= totalProjects && totalProjects > 0
  const dims = effectiveDims(event)

  return (
    <div className="min-h-screen bg-surface text-fg">
      {/* Header */}
      <div className="border-b border-token bg-bg">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Link href={`/events/${eventId}`}
            className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-[var(--color-fg)] mb-4 transition-colors">
            <ArrowLeft size={14} /> {t('reviewerPage.backToEvent')}
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-fg">{t('reviewerPage.title')}</h1>
              <p className="text-sm text-fg-muted mt-0.5">{event.name}</p>
            </div>
            <div className="flex items-center gap-2">
              {!allSubmitted && totalProjects > 0 && Object.keys(scoreMap).length > 0 && (
                <button onClick={openSubmitDialog}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg font-medium transition-all">
                  <Send size={13} /> {t('reviewerPage.submitFinal')}
                </button>
              )}
              {allSubmitted && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300 text-sm">
                  <CheckCircle2 size={13} /> {t('reviewerPage.allSubmitted')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('reviewerPage.stat.total'), val: totalProjects },
            { label: t('reviewerPage.stat.aiReviewed'), val: Object.keys(scoreMap).length },
            { label: t('reviewerPage.stat.submitted'), val: submittedCount },
          ].map(s => (
            <div key={s.label} className="bg-bg border border-token rounded-xl p-4">
              <p className="text-xs text-fg-muted mb-1">{s.label}</p>
              <p className="text-2xl font-bold text-fg">{s.val}</p>
            </div>
          ))}
        </div>

        {/* Pre-analysis warning */}
        {preAnalysisRequired && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">{t('reviewerPage.preAnalysisWarning')}</p>
              <p className="text-xs text-amber-600 mt-0.5">{t('reviewerPage.preAnalysisDesc')}</p>
            </div>
          </div>
        )}

        {/* AI Review Control */}
        <div className="bg-bg border border-token rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={15} className="text-blue-600" />
            <span className="text-sm font-semibold text-fg">{t('reviewerPage.aiControl.title')}</span>
          </div>
          <p className="text-xs text-fg-muted mb-4">{t('reviewerPage.aiControl.desc')}</p>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Model tabs */}
            <div className="flex gap-1 flex-wrap">
              {event.models.map(m => (
                <button key={m}
                  onClick={() => setSelectedModel(m)}
                  disabled={running}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-50 ${selectedModel === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-bg hover:bg-[var(--color-surface)] border-token-strong text-fg-muted'}`}>
                  {MODEL_NAMES[m] || m}
                </button>
              ))}
            </div>
            <button onClick={() => setShowPromptBox(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-[var(--color-surface)] border border-token-strong text-fg-muted text-sm rounded-lg transition-colors">
              <Settings2 size={13} /> {showPromptBox ? t('reviewerPage.aiControl.collapsePrompt') : t('reviewerPage.aiControl.customPrompt')}
            </button>
            <button onClick={() => {
              setDraftWeights(dims.map(d => ({ name: d.name, weight: d.weight })))
              setEditWeights(true)
            }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg hover:bg-[var(--color-surface)] border border-token-strong text-fg-muted text-sm rounded-lg transition-colors">
              <Settings2 size={13} /> {t('reviewerPage.aiControl.adjustWeights')}
            </button>
            <button onClick={handleRunAI} disabled={running || !selectedModel}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-surface-2 disabled:text-fg-subtle text-white text-sm rounded-lg font-medium transition-all">
              {running && runProgress
                ? <><Loader2 size={13} className="animate-spin" />{t('reviewerPage.running')} ({runProgress.done}/{runProgress.total})...</>
                : running
                  ? <><Loader2 size={13} className="animate-spin" />{t('reviewerPage.running')}...</>
                  : Object.keys(scoreMap).length > 0
                    ? <><Play size={13} />{t('reviewerPage.reReview')} ({Object.keys(scoreMap).length}/{totalProjects})</>
                    : <><Play size={13} />{t('reviewerPage.startReview')}</>}
            </button>
          </div>
          {showPromptBox && (
            <Textarea
              placeholder={t('reviewerPage.aiControl.promptPlaceholder')}
              value={dimensionPrompt}
              onChange={e => setDimensionPrompt(e.target.value)}
              rows={3}
              className="mt-3 bg-surface-2 border-token text-fg-muted placeholder:text-fg-subtle text-sm"
            />
          )}
          {customWeights && (
            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle size={11} /> {t('reviewerPage.aiControl.customWeightsActive')}
            </p>
          )}
        </div>

        {/* Projects Table */}
        {projects.length === 0 ? (
          <div className="bg-bg border border-token rounded-2xl p-12 text-center">
            <Brain size={32} className="mx-auto mb-3 text-fg-subtle" />
            <p className="text-sm text-fg-muted">{t('reviewerPage.noProjects')}</p>
          </div>
        ) : (
          <div className="bg-bg border border-token rounded-2xl p-4">
            <ProjectsTable
              key={tableKey}
              eventId={eventId}
              initialProjects={projectsForTable}
              headerName={t('table.colName')}
              headerTeam={t('table.colTeam')}
              headerTags={t('table.colTags')}
              showTeam={projectsForTable.some(p => p.team_name?.trim())}
              showTags={false}
              showDemo={true}
              showPitch={true}
              visibleExtraKeys={[]}
              isOwner={false}
              reviewerMode={true}
              onAdjustScore={handleAdjustScore}
              onSubmitProject={handleSubmitProject}
              submittedProjectIds={submittedProjectIds}
              rowActions={(project) => {
                const ps = scoreMap[project.id]
                if (!ps || !Object.keys(ps).length) return null
                return (
                  <button
                    onClick={() => openAdjustDialog(project.id, selectedModel !== 'avg' ? selectedModel : undefined)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded border border-blue-200 transition-colors whitespace-nowrap">
                    {t('editScore.adjustBtn')}
                  </button>
                )
              }}
            />
          </div>
        )}
      </div>

      {/* Edit Score Dialog */}
      {editTarget && event && (() => {
        const editProject = projects.find(p => p.id === editTarget.projectId)
        const ps = scoreMap[editTarget.projectId] ?? {}
        const modelKeys = Object.keys(ps)
        const currentScore = ps[editTarget.selectedModel]
        return (
          <Dialog open={!!editTarget} onOpenChange={o => !o && setEditTarget(null)}>
            <DialogContent className="max-w-md bg-bg text-fg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {t('editScore.title')} — {editProject?.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Model selector */}
                {modelKeys.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {modelKeys.map(m => (
                      <button key={m}
                        onClick={() => {
                          const s = ps[m]
                          if (!s) return
                          const newDims: Record<string, number> = {}
                          for (const d of event.dimensions) {
                            newDims[d.name] = s.final_dimension_scores?.[d.name] ?? s.ai_dimension_scores?.[d.name] ?? 5
                          }
                          setEditTarget(prev => prev ? { ...prev, selectedModel: m, dims: newDims } : prev)
                        }}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors ${editTarget.selectedModel === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-bg border-token-strong text-fg-muted hover:border-[var(--color-border-strong)]'}`}>
                        {MODEL_NAMES[m] ?? m}
                      </button>
                    ))}
                  </div>
                )}
                {modelKeys.length === 1 && (
                  <div className="text-xs text-fg-muted">
                    {t('editScore.title')} · <span className="font-medium text-fg-muted">{MODEL_NAMES[editTarget.selectedModel] ?? editTarget.selectedModel}</span>
                  </div>
                )}
                {currentScore?.ai_comment && (
                  <div className="rounded-lg bg-surface px-3 py-2 text-xs text-fg-muted">{t('editScore.aiComment')}{currentScore.ai_comment}</div>
                )}
                <div className="space-y-4">
                  {event.dimensions.map(dim => (
                    <div key={dim.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{dim.name}<span className="text-xs text-fg-muted ml-1">({dim.weight}%)</span></span>
                        <span className="font-semibold">{(editTarget.dims[dim.name] ?? 5).toFixed(1)}</span>
                      </div>
                      <input type="range" min={1} max={10} step={0.5}
                        value={editTarget.dims[dim.name] ?? 5}
                        onChange={e => setEditTarget(prev => prev ? {
                          ...prev,
                          dims: { ...prev.dims, [dim.name]: parseFloat(e.target.value) }
                        } : prev)}
                        className="w-full accent-blue-600" />
                      <div className="flex justify-between text-xs text-fg-muted">
                        <span>1</span>
                        {currentScore?.ai_dimension_scores?.[dim.name] != null && (
                          <span>{t('editScore.aiSuggestion')}{currentScore.ai_dimension_scores[dim.name]}</span>
                        )}
                        <span>10</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-surface-2 text-fg px-4 py-3 flex justify-between items-center">
                  <span className="text-sm">{t('editScore.weightedScore')}</span>
                  <span className="font-bold text-xl">{computeWeighted(editTarget.dims, event).toFixed(2)}</span>
                </div>
              </div>
              <DialogFooter>
                <button onClick={() => setEditTarget(null)} disabled={saving}
                  className="px-4 py-2 border border-token rounded-lg text-sm text-fg-subtle hover:bg-[var(--color-surface)] transition-colors">
                  {t('editScore.cancel')}
                </button>
                <button onClick={handleSaveScore} disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {saving ? t('editScore.saving') : t('editScore.save')}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}

      {/* Custom Weights Dialog */}
      {editWeights && event && (
        <Dialog open={editWeights} onOpenChange={o => !o && setEditWeights(false)}>
          <DialogContent className="max-w-sm bg-bg text-fg">
            <DialogHeader><DialogTitle>{t('weights.title')}</DialogTitle></DialogHeader>
            <p className="text-xs text-fg-muted">{t('weights.desc')}</p>
            <div className="space-y-3 py-2">
              {draftWeights.map((d, i) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="text-sm flex-1">{d.name}</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={100} value={d.weight}
                      onChange={e => {
                        const v = parseInt(e.target.value) || 0
                        setDraftWeights(prev => prev.map((w, j) => j === i ? { ...w, weight: v } : w))
                      }}
                      className="w-16 border rounded px-2 py-1 text-sm text-right" />
                    <span className="text-xs text-fg-muted">%</span>
                  </div>
                </div>
              ))}
              <div className={`text-xs flex justify-between font-medium ${Math.abs(draftWeights.reduce((s, d) => s + d.weight, 0) - 100) > 1 ? 'text-red-500' : 'text-emerald-600'}`}>
                <span>{t('weights.currentTotal')}</span>
                <span>{draftWeights.reduce((s, d) => s + d.weight, 0)}%</span>
              </div>
            </div>
            <DialogFooter>
              <button onClick={() => setEditWeights(false)}
                className="px-4 py-2 border border-token rounded-lg text-sm text-fg-subtle">{t('weights.cancel')}</button>
              <button onClick={handleSaveWeights} disabled={savingWeights}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {savingWeights ? t('weights.saving') : t('weights.save')}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Final Submit Dialog */}
      {submitDialog && event && (
        <Dialog open={submitDialog} onOpenChange={o => !o && !submitting && setSubmitDialog(false)}>
          <DialogContent className="max-w-lg bg-bg text-fg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t('submitDialog.title')}</DialogTitle></DialogHeader>
            <p className="text-xs text-fg-muted mb-3">{t('submitDialog.desc')}</p>
            <div className="space-y-3">
              {projects.filter(p => pendingSubmissions[p.id]).map(project => {
                const ps = scoreMap[project.id] ?? {}
                const models = Object.keys(ps)
                const sub = pendingSubmissions[project.id]
                if (!sub) return null
                return (
                  <div key={project.id} className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium">{project.name}</p>
                    <div className="flex gap-2 flex-wrap">
                      {models.length > 1 && (
                        <button onClick={() => {
                          const allDims: Record<string, number> = {}
                          for (const d of event.dimensions) {
                            const vals = models.map(m => ps[m]?.final_dimension_scores?.[d.name] ?? ps[m]?.ai_dimension_scores?.[d.name] ?? 0).filter(v => v > 0)
                            allDims[d.name] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
                          }
                          setPendingSubmissions(prev => ({
                            ...prev,
                            [project.id]: { source: 'average', selected_models: models, final_dimension_scores: allDims, final_overall_score: computeWeighted(allDims, event) }
                          }))
                        }}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${sub.source === 'average' ? 'bg-surface-2 text-fg border-[var(--color-fg)]' : 'bg-bg border-token hover:border-[var(--color-border-strong)]'}`}>
                          {t('submitDialog.multiModelAvg')}
                        </button>
                      )}
                      {models.map(m => (
                        <button key={m} onClick={() => {
                          const s = ps[m]
                          const dimVals = s.final_dimension_scores ?? s.ai_dimension_scores ?? {}
                          setPendingSubmissions(prev => ({
                            ...prev,
                            [project.id]: { source: `model:${m}`, selected_models: [m], final_dimension_scores: dimVals, final_overall_score: computeWeighted(dimVals, event) }
                          }))
                        }}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${sub.source === `model:${m}` ? 'bg-surface-2 text-fg border-[var(--color-fg)]' : 'bg-bg border-token hover:border-[var(--color-border-strong)]'}`}>
                          {MODEL_NAMES[m] || m}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-fg-muted">{t('submitDialog.finalScore')}<span className="font-bold text-fg">{sub.final_overall_score.toFixed(2)}</span></p>
                      {submitErrors[project.id] && (
                        <span className="text-xs text-red-500 font-medium">{submitErrors[project.id]}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <DialogFooter className="mt-4">
              <button onClick={() => setSubmitDialog(false)} disabled={submitting}
                className="px-4 py-2 border border-token rounded-lg text-sm text-fg-subtle">{t('submitDialog.cancel')}</button>
              <button onClick={handleFinalSubmit} disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1">
                {submitting ? <><Loader2 size={13} className="animate-spin" />{t('submitDialog.submitting')}</> : t('submitDialog.confirm')}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
