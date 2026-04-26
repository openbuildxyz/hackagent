'use client'

import React, { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Github, Globe, Tag, Trash2, CheckSquare, Pencil, ChevronUp, ChevronDown, Video, X as XIcon, ImageIcon } from 'lucide-react'
import ImageUpload from '@/components/ImageUpload'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

type AiReview = { model: string; score: number; dimensions?: Record<string, number>; summary?: string | { zh: string; en: string }; error?: boolean }
type SonarMetrics = { bugs?: string|number; vulnerabilities?: string|number; code_smells?: string|number; ncloc?: string|number; complexity?: string|number; duplicated_lines_density?: string|number; reliability_rating?: string|number; security_rating?: string|number; sqale_rating?: string|number }
type AnalysisResult = {
  ai_reviews?: AiReview[]
  github_analysis?: { stars?: number; forks?: number; contributors_count?: number; commit_count_30d?: number; fake_code_flags?: string[]; languages?: Record<string, { pct: number }>; has_readme?: boolean; has_tests?: boolean; size_kb?: number }
  web3_analysis?: { web3insight?: { total_score?: number; top_ecosystem?: string; is_web3_developer?: boolean }; contributors?: Array<{ username: string; web3_score?: number; is_web3_dev?: boolean; top_eco?: string }>; twitter?: { handle?: string; username?: string; followers?: number | null; followers_count?: number | null; is_kol?: boolean } | null }
  sonar_analysis?: { metrics?: SonarMetrics }
}

type Track = {
  id: string
  name: string
  description?: string
  prize?: string
}

type Project = {
  id: string
  name: string
  github_url: string | null
  demo_url: string | null
  pitch_url: string | null
  team_name: string | null
  tags: string[] | null
  status: string
  analysis_status: string | null
  track_ids?: string[]
  extra_fields: Record<string, string> | null
  description?: string | null
  analysis_result?: AnalysisResult | null
  reviewer_submissions?: AiReview[] | null
  logo_url?: string | null
}

const MODEL_LABEL: Record<string, string> = {
  minimax: 'MiniMax', claude: 'Claude', gemini: 'Gemini', gpt4o: 'GPT-4o', deepseek: 'DeepSeek', kimi: 'Kimi', glm: 'GLM',
}
const MODEL_COLOR: Record<string, string> = {
  minimax: '#3b82f6', claude: '#f97316', gemini: '#22c55e', gpt4o: '#a855f7', deepseek: '#06b6d4', kimi: '#ec4899', glm: '#6366f1',
}

const STATUS_CLS: Record<string, string> = {
  pending:   'text-yellow-600 bg-yellow-50',
  running:   'text-blue-600 bg-blue-50',
  completed: 'text-green-700 bg-green-50',
  error:     'text-red-500 bg-red-50',
}

function scoreColor(v: number) {
  if (v >= 8) return '#22c55e'
  if (v >= 6) return '#3b82f6'
  if (v >= 4) return '#f59e0b'
  return '#ef4444'
}

const isUrl = (v: string) => /^https?:\/\//i.test(v?.trim() ?? '')

function getAvgScore(project: Project, model?: string): number | null {
  const reviews = project.analysis_result?.ai_reviews ?? project.reviewer_submissions ?? []
  const valid = reviews.filter(r => !r.error && (r.score ?? 0) > 0)
  if (!valid.length) return null
  if (model) {
    const r = valid.find(r => r.model === model)
    return r ? r.score : null
  }
  return valid.reduce((s, r) => s + r.score, 0) / valid.length
}

interface Props {
  eventId: string
  eventStatus?: string
  initialProjects: Project[]
  headerName: string
  headerTeam: string
  headerTags: string
  showTeam: boolean
  showTags: boolean
  showDemo: boolean
  showPitch?: boolean
  visibleExtraKeys: string[]
  isOwner: boolean
  fieldLabels?: Record<string, string>  // column_mapping.__labels__ 动态标签
  tracks?: Track[]
  // Reviewer mode props
  reviewerMode?: boolean
  onAdjustScore?: (projectId: string, model: string) => void
  onSubmitProject?: (projectId: string) => void
  submittedProjectIds?: Set<string>
  rowActions?: (project: Project) => React.ReactNode
}

function SummaryBlock({ text, variant = 'ai' }: { text: string; variant?: 'ai' | 'desc' }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > 500
  const cls = variant === 'ai'
    ? 'border-l-2 border-blue-400 pl-3 text-fg-muted bg-blue-50/50 py-1.5 pr-2 rounded-r text-[11px] leading-relaxed'
    : 'text-fg-muted text-[11px] leading-relaxed'
  return (
    <div className={cls}>
      <span className={!expanded && isLong ? 'line-clamp-6' : ''}>{text}</span>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="block mt-1 text-blue-500 hover:text-blue-700 text-[10px] font-medium"
        >
          {expanded ? '收起 ▲' : '展开 ▼'}
        </button>
      )}
    </div>
  )
}

export default function ProjectsTable({
  eventId, eventStatus, initialProjects, headerName, headerTeam, headerTags,
  showTeam, showTags, showPitch, visibleExtraKeys, isOwner, fieldLabels = {},
  tracks = [],
  reviewerMode, onAdjustScore, onSubmitProject, submittedProjectIds, rowActions,
}: Props) {
  const fl = fieldLabels  // alias
  const t = useT()
  const isDone = eventStatus === 'done'
  const statusLabel = (s: string) => t(('table.analysisStatus.' + s) as Parameters<typeof t>[0]) || s
  const [projects, setProjects] = useState(initialProjects)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editForm, setEditForm] = useState<Partial<Project>>({})
  const [editExtra, setEditExtra] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [modelFilter, setModelFilter] = useState<string>('avg')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [scoreFilter, setScoreFilter] = useState('all')
  const [codeFilter, setCodeFilter] = useState('all')
  const [web3Filter, setWeb3Filter] = useState('all')
  const [scoreMode, setScoreMode] = useState<'llm' | 'llmCode'>('llm')
  const [trackFilter, setTrackFilter] = useState<string>('all')
  const trackCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of projects) {
      for (const tid of p.track_ids ?? []) {
        counts[tid] = (counts[tid] ?? 0) + 1
      }
    }
    return counts
  }, [projects])

  // Detect available models from data
  const availableModels = useMemo(() => {
    const set = new Set<string>()
    for (const p of projects) {
      const reviews = p.analysis_result?.ai_reviews ?? p.reviewer_submissions ?? []
      reviews.filter(r => !r.error && r.score > 0).forEach(r => set.add(r.model))
    }
    return Array.from(set)
  }, [projects])

  const hasScores = availableModels.length > 0

  // Compute sonar score (0-10) from ratings
  const getSonarScore = useCallback((project: Project): number | null => {
    const metrics = project.analysis_result?.sonar_analysis?.metrics
    if (!metrics) return null
    const ratingToScore = (v?: string | number): number | null => {
      if (v == null) return null
      const n = Math.round(Number(v))
      if (n < 1 || n > 5) return null
      return [10, 8, 6, 4, 2][n - 1]
    }
    const scores = [
      ratingToScore(metrics.sqale_rating),
      ratingToScore(metrics.reliability_rating),
      ratingToScore(metrics.security_rating),
    ].filter((s): s is number => s !== null)
    if (!scores.length) return null
    return (scores.reduce((a, b) => a + b, 0) / scores.length / 10) * 10
  }, [])

  const getComputedScore = useCallback((project: Project, model?: string): number | null => {
    const llmScore = getAvgScore(project, model)
    if (scoreMode === 'llm') return llmScore
    const sonar = getSonarScore(project)
    if (llmScore === null) return null
    if (sonar === null) return llmScore
    return llmScore * 0.7 + sonar * 0.3
  }, [scoreMode, getSonarScore])

  const getCodeStatus = (project: Project): 'normal' | 'fake' | 'suspect' => {
    const flags = project.analysis_result?.github_analysis?.fake_code_flags
    if (!flags || flags.length === 0) return 'normal'
    if (flags.includes('llm_fake_code')) return 'fake'
    return 'suspect'
  }

  // Sorted projects
  const sortedProjects = useMemo(() => {
    if (!hasScores) {
      if (trackFilter === 'all') return projects
      return projects.filter(p => p.track_ids?.includes(trackFilter) ?? false)
    }
    const modelArg = modelFilter === 'avg' ? undefined : modelFilter
    const q = searchQuery.toLowerCase()

    const filtered = projects.filter(p => {
      // search
      if (q) {
        const nameMatch = p.name.toLowerCase().includes(q)
        const teamMatch = (p.team_name ?? '').toLowerCase().includes(q)
        if (!nameMatch && !teamMatch) return false
      }
      // score filter
      const score = getComputedScore(p, modelArg)
      if (scoreFilter === 'high' && (score === null || score < 7)) return false
      if (scoreFilter === 'mid' && (score === null || score < 5 || score >= 7)) return false
      if (scoreFilter === 'low' && (score === null || score >= 5)) return false
      if (scoreFilter === 'none' && score !== null) return false
      // code filter
      if (codeFilter !== 'all') {
        const cs = getCodeStatus(p)
        if (codeFilter === 'normal' && cs !== 'normal') return false
        if (codeFilter === 'fake' && cs !== 'fake') return false
        if (codeFilter === 'suspect' && cs !== 'suspect') return false
      }
      // web3 filter
      if (web3Filter !== 'all') {
        const hasWeb3 = (p.analysis_result?.web3_analysis?.web3insight?.total_score ?? 0) > 0
        if (web3Filter === 'has' && !hasWeb3) return false
        if (web3Filter === 'no' && hasWeb3) return false
      }
      // track filter
      if (trackFilter !== 'all' && !(p.track_ids?.includes(trackFilter))) return false
      return true
    })

    return filtered.sort((a, b) => {
      const sa = getComputedScore(a, modelArg) ?? -1
      const sb = getComputedScore(b, modelArg) ?? -1
      return sortDir === 'desc' ? sb - sa : sa - sb
    })
  }, [projects, modelFilter, sortDir, hasScores, searchQuery, scoreFilter, codeFilter, web3Filter, trackFilter, getComputedScore])

  const allSelected = projects.length > 0 && selected.size === projects.length

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(projects.map(p => p.id)))
  }
  const toggleOne = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const doDelete = useCallback(async (ids: string[] | 'all') => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/events/${eventId}/projects`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) { toast.error((await res.json()).error || '删除失败'); return }
      if (ids === 'all') { setProjects([]); setSelected(new Set()); toast.success('已清空全部项目') }
      else {
        const s = new Set(ids)
        setProjects(prev => prev.filter(p => !s.has(p.id)))
        setSelected(new Set()); toast.success(`已删除 ${ids.length} 个项目`)
      }
    } finally { setDeleting(false) }
  }, [eventId])

  const confirmDelete = (ids: string[] | 'all') => {
    const label = ids === 'all' ? '全部项目' : `${ids.length} 个项目`
    if (!confirm(`确认删除${label}？此操作不可恢复。`)) return
    doDelete(ids)
  }

  const openEdit = (p: Project) => {
    setEditProject(p)
    setEditForm({ name: p.name, github_url: p.github_url ?? '', demo_url: p.demo_url ?? '', team_name: p.team_name ?? '', track_ids: p.track_ids ?? [], logo_url: p.logo_url ?? null })
    setEditExtra({ ...(p.extra_fields ?? {}) })
  }
  const saveEdit = async () => {
    if (!editProject) return
    setSaving(true)
    try {
      const payload = { ...editForm, extra_fields: { ...(editProject.extra_fields ?? {}), ...editExtra } }
      const res = await fetch(`/api/events/${eventId}/projects/${editProject.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error || '保存失败')
      setProjects(prev => prev.map(p => p.id === editProject.id ? { ...p, ...payload } : p))
      setEditProject(null); toast.success('已保存')
    } catch (e) { toast.error(e instanceof Error ? e.message : '保存失败') }
    finally { setSaving(false) }
  }

  const renderLink = (url: string | null, icon: React.ReactNode) => {
    if (!url) return <span className="text-fg-subtle" title="未评分">—</span>
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="text-xs text-blue-500 hover:underline flex items-center gap-1 truncate max-w-[120px]">
        {icon}
        <span className="truncate">{url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 28)}</span>
      </a>
    )
  }

  const renderTags = (tags: string[] | null) => {
    if (!tags?.length) return <span className="text-fg-subtle">—</span>
    if (isUrl(tags[0])) return renderLink(tags[0], <Globe size={12} />)
    // If the tag looks like a prize/award string (contains commas with "Prize" or "Track"), show truncated
    const firstTag = tags[0] ?? ''
    const isPrizeString = firstTag.includes('Prize') || firstTag.includes('Grand') || firstTag.includes(',')
    if (isPrizeString) {
      const display = firstTag.length > 40 ? firstTag.slice(0, 40) + '…' : firstTag
      return <span className="text-xs text-fg-muted max-w-[140px] truncate block" title={firstTag}>{display}</span>
    }
    return (
      <div className="flex gap-1 flex-wrap">
        {tags.slice(0, 2).map(t => (
          <span key={t} className="text-xs bg-surface-2 text-fg-muted rounded px-1.5 py-0.5 flex items-center gap-0.5">
            <Tag size={9} />{t}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          {isOwner && !isDone && (
            <>
              {selected.size > 0 ? (
                <>
                  <Button size="sm" variant="destructive" disabled={deleting} onClick={() => confirmDelete(Array.from(selected))}>
                    <Trash2 size={13} className="mr-1" />删除选中 ({selected.size})
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setSelected(new Set())}>取消</Button>
                </>
              ) : (
                <>
                  {projects.length > 0 && !isDone && (
                    <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={toggleAll}>
                      <CheckSquare size={13} className="mr-1" />{t('table.selectAll')}
                    </Button>
                  )}
                  {projects.length > 0 && !isDone && (
                    <Button size="sm" variant="ghost" className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                      disabled={deleting} onClick={() => confirmDelete('all')}>
                      <Trash2 size={13} className="mr-1" />{t('table.clearAll')}
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Model filter */}
        {hasScores && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('table.filterByModel')}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setModelFilter('avg')}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${modelFilter === 'avg' ? 'bg-[var(--color-fg)] text-white border-[var(--color-fg)]' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
              >{t('table.avgScore')}</button>
              {availableModels.map(m => (
                <button key={m}
                  onClick={() => setModelFilter(m)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${modelFilter === m ? 'text-white border-transparent' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
                  style={modelFilter === m ? { backgroundColor: MODEL_COLOR[m] ?? '#6b7280' } : {}}
                >{MODEL_LABEL[m] ?? m}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter bar */}
      {hasScores && (
        <div className="flex items-center gap-2 mb-3 bg-surface rounded-lg p-3 text-sm flex-wrap">
          <Input
            className="flex-1 min-w-[180px] h-8 text-sm"
            placeholder={t('table.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <Select value={scoreFilter} onValueChange={setScoreFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('table.filter.allScores')}</SelectItem>
              <SelectItem value="high">{t('table.filter.highScore')}</SelectItem>
              <SelectItem value="mid">{t('table.filter.midScore')}</SelectItem>
              <SelectItem value="low">{t('table.filter.lowScore')}</SelectItem>
              <SelectItem value="none">{t('table.filter.noScore')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={codeFilter} onValueChange={setCodeFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('table.filter.allCodeStatus')}</SelectItem>
              <SelectItem value="normal">{t('table.filter.codeNormal')}</SelectItem>
              <SelectItem value="fake">{t('table.filter.codeFake')}</SelectItem>
              <SelectItem value="suspect">{t('table.filter.codeSuspect')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={web3Filter} onValueChange={setWeb3Filter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('table.filter.allWeb3')}</SelectItem>
              <SelectItem value="has">{t('table.filter.hasWeb3')}</SelectItem>
              <SelectItem value="no">{t('table.filter.noWeb3')}</SelectItem>
            </SelectContent>
          </Select>
          {tracks.length > 0 && (
            <Select value={trackFilter} onValueChange={setTrackFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('track.all')}</SelectItem>
                {tracks.map(tr => (
                  <SelectItem key={tr.id} value={tr.id}>{tr.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {t('table.resultCount').replace('{n}', String(sortedProjects.length))}
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setScoreMode('llm')}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${scoreMode === 'llm' ? 'bg-[var(--color-fg)] text-white border-[var(--color-fg)]' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
            >{t('table.scoreMode.llm')}</button>
            <button
              onClick={() => setScoreMode('llmCode')}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${scoreMode === 'llmCode' ? 'bg-[var(--color-fg)] text-white border-[var(--color-fg)]' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
            >{t('table.scoreMode.llmCode')}</button>
          </div>
        </div>
      )}

      {tracks.length > 0 && !hasScores && (
        <>
        <div className="mb-1 text-xs text-muted-foreground">{t('track.label')}:</div>
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-0.5" style={{flexWrap:"nowrap"}}>
          <button
            onClick={() => setTrackFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${trackFilter === 'all' ? 'bg-[var(--color-fg)] text-white border-[var(--color-fg)]' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
          >{t('track.all')}</button>
          {tracks.map(tr => (
            <button key={tr.id}
              onClick={() => setTrackFilter(tr.id)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${trackFilter === tr.id ? 'bg-purple-600 text-white border-purple-600' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
            >{tr.name}{trackCounts[tr.id] != null ? ` (${trackCounts[tr.id]})` : ""}</button>
          ))}
        </div>
        </>
      )}
      {projects.length === 0 ? (
        <div className="text-center text-muted-foreground py-10 text-sm">暂无项目</div>
      ) : (
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[var(--color-surface)]">
              {isOwner && <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>}
              <TableHead className="w-8 text-center text-muted-foreground">#</TableHead>
              <TableHead>{headerName}</TableHead>
              {showTeam && <TableHead>{headerTeam}</TableHead>}
              <TableHead>GitHub</TableHead>
              <TableHead>Demo</TableHead>
              {showPitch && <TableHead>Pitch</TableHead>}
              {showTags && <TableHead>{headerTags}</TableHead>}
              {visibleExtraKeys.map(k => <TableHead key={k}>{k}</TableHead>)}
              {hasScores && (
                <TableHead>
                  <button className="flex items-center gap-1 font-medium" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}>
                    {t('table.colScore')}
                    {sortDir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                  </button>
                </TableHead>
              )}
              <TableHead>{t('table.colStatus')}</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedProjects.map((project, index) => {
              const pStatusKey = project.analysis_status ?? 'pending'
              const pStatus = { label: statusLabel(pStatusKey), cls: STATUS_CLS[pStatusKey] ?? STATUS_CLS.pending }
              const score = getComputedScore(project, modelFilter === 'avg' ? undefined : modelFilter)              // Get per-model scores for mini bars
              const reviews = project.analysis_result?.ai_reviews ?? project.reviewer_submissions ?? []
              const validReviews = reviews.filter(r => !r.error && (r.score ?? 0) > 0)

              return (
                <React.Fragment key={project.id}>
                <TableRow
                  className={`hover:bg-[var(--color-surface)]/50 transition-colors ${selected.has(project.id) ? 'bg-blue-50/30' : ''}`}>
                  {isOwner && (
                    <TableCell>
                      <Checkbox checked={selected.has(project.id)} onCheckedChange={() => toggleOne(project.id)} />
                    </TableCell>
                  )}
                  <TableCell className="text-center text-xs text-muted-foreground font-mono">{index + 1}</TableCell>
                  <TableCell className="font-medium max-w-[200px]">
                    <div className="flex items-center gap-2">
                      {project.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={project.logo_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: `hsl(${((project.name.charCodeAt(0) ?? 65) * 47) % 360}, 60%, 55%)` }}
                        >
                          {(project.name[0] ?? '?').toUpperCase()}
                        </div>
                      )}
                      <Link href={`/events/${eventId}/projects/${project.id}`}
                        className="hover:text-blue-600 hover:underline transition-colors line-clamp-1" title={project.name}>
                        {project.name}
                      </Link>
                    </div>
                    {tracks.length > 0 && (project.track_ids ?? []).length > 0 && (project.track_ids ?? []).map(tid => {
                      const tr = tracks.find(t => t.id === tid)
                      return tr ? (
                        <span key={tid} className="mt-0.5 inline-block text-[10px] text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0 rounded-sm whitespace-nowrap">
                          {tr.name}
                        </span>
                      ) : null
                    })}
                  </TableCell>
                  {showTeam && (
                    <TableCell className="text-sm text-muted-foreground max-w-[150px]">
                      <span className="truncate block" title={project.team_name ?? ''}>{project.team_name || '—'}</span>
                    </TableCell>
                  )}
                  <TableCell>{renderLink(project.github_url, <Github size={12} />)}</TableCell>
                  <TableCell>{renderLink(project.demo_url, <Globe size={12} />)}</TableCell>
                  {showPitch && <TableCell>{renderLink(project.pitch_url, <Video size={12} />)}</TableCell>}
                  {showTags && <TableCell>{renderTags(project.tags)}</TableCell>}
                  {visibleExtraKeys.map(k => {
                    const val = project.extra_fields?.[k] ?? ''
                    return (
                      <TableCell key={k} className="max-w-[180px]">
                        {val ? (isUrl(val)
                          ? <a href={val} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate block">{val.replace(/^https?:\/\//, '').slice(0, 28)}…</a>
                          : <span className="text-sm text-muted-foreground truncate block">{val}</span>
                        ) : <span className="text-fg-subtle">—</span>}
                      </TableCell>
                    )
                  })}
                  {hasScores && (
                    <TableCell>
                      {score !== null ? (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          {/* Big score number */}
                          <span className="text-base font-bold tabular-nums w-10 shrink-0" style={{ color: scoreColor(score) }}>
                            {score.toFixed(1)}
                          </span>
                          {/* Mini model bars */}
                          <div className="flex items-end gap-0.5 h-5">
                            {availableModels.map(m => {
                              const r = validReviews.find(r => r.model === m)
                              const h = r ? Math.max(2, Math.round((r.score / 10) * 20)) : 2
                              return (
                                <div key={m} title={`${MODEL_LABEL[m]}: ${r?.score ?? '—'}`}
                                  className="w-2 rounded-sm opacity-80 transition-all"
                                  style={{ height: `${h}px`, backgroundColor: r ? MODEL_COLOR[m] : '#e5e7eb' }} />
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-fg-subtle">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${pStatus.cls}`}>{pStatus.label}</span>
                      {isOwner && (
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(project)}>
                          <Pencil size={12} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {rowActions && rowActions(project)}
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}>
                        {expandedId === project.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {/* Expanded row */}
                {expandedId === project.id && (() => {
                  const ar = project.analysis_result
                  const gh = ar?.github_analysis
                  const sonarM = ar?.sonar_analysis?.metrics ?? null
                  const numToRating = (v?: string|number): string => { if (!v) return '?'; const n = Math.round(Number(v)); return (['A','B','C','D','E'][n-1] ?? '?') }
                  const ratingColor: Record<string, string> = { A:'#22c55e', B:'#86efac', C:'#facc15', D:'#f97316', E:'#ef4444' }
                  const w3 = ar?.web3_analysis?.web3insight
                  const contribs = ar?.web3_analysis?.contributors ?? []
                  const langs = gh?.languages ? Object.entries(gh.languages).sort((a,b)=>(b[1].pct??0)-(a[1].pct??0)).slice(0,5) : []
                  const flags = gh?.fake_code_flags ?? []
                  const colCount = (isOwner ? 1 : 0) + 2 + (showTeam ? 1 : 0) + 2 + (showTags ? 1 : 0) + visibleExtraKeys.length + (hasScores ? 1 : 0) + 2
                  const aiReview = ar?.ai_reviews?.find(r => !r.error && (r.score ?? 0) > 0)
                  const summary = aiReview?.summary
                  const summaryText = typeof summary === 'string' ? summary : summary?.zh ?? null
                  const dimensions = aiReview?.dimensions ?? null
                  const revSubs = project.reviewer_submissions?.filter(r => !r.error && (r.score ?? 0) > 0) ?? []
                  const codeStatusBadge = flags.length === 0
                    ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-600 border border-green-100">正常</span>
                    : flags.includes('llm_fake_code')
                    ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-500 border border-red-100">疑似AI代码</span>
                    : <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-500 border border-orange-100">存疑</span>

                  return (
                    <tr key={`${project.id}-expanded`}>
                      <td colSpan={colCount} className="px-4 py-4 border-b border-token">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">

                          {/* 左列：项目信息 */}
                          <div className="space-y-2">
                            <p className="font-semibold text-fg-muted text-xs mb-1">项目信息</p>
                            {/* 链接按钮 */}
                            <div className="flex flex-wrap gap-1.5">
                              {project.github_url && (
                                <a href={project.github_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-token bg-bg text-fg-muted hover:text-[var(--color-fg)] hover:border-[var(--color-border-strong)] text-[11px]">
                                  <Github size={11} /> GitHub
                                </a>
                              )}
                              {project.demo_url && (
                                <a href={project.demo_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-token bg-bg text-fg-muted hover:text-[var(--color-fg)] hover:border-[var(--color-border-strong)] text-[11px]">
                                  <Globe size={11} /> Demo
                                </a>
                              )}
                              {project.pitch_url && (
                                <a href={project.pitch_url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-purple-600 hover:underline">
                                  <Video size={11} /> Pitch
                                </a>
                              )}
                              {project.extra_fields && Object.entries(project.extra_fields).filter(([,v]) => isUrl(v)).map(([k, v]) => (
                                <a key={k} href={v} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-token bg-bg text-fg-muted hover:text-[var(--color-fg)] hover:border-[var(--color-border-strong)] text-[11px]">
                                  <Globe size={11} /> {k}
                                </a>
                              ))}
                            </div>
                            {/* 描述 */}
                            {project.description && (
                              <SummaryBlock text={project.description} variant="desc" />
                            )}
                            {/* AI 摘要 */}
                            {summaryText && (() => {
                              return <SummaryBlock text={summaryText} />
                            })()}
                          </div>

                          {/* 中列：代码 & 开发者 */}
                          <div className="space-y-0">
                            <p className="font-semibold text-fg-muted text-xs mb-2">代码 &amp; 开发者</p>
                            {/* label-value 表格 */}
                            <div className="divide-y divide-[var(--color-border)]">
                              {/* 代码状态 */}
                              <div className="flex items-center justify-between py-1">
                                <span className="text-fg-subtle text-xs">{t('table.codeStatus')}</span>
                                {codeStatusBadge}
                              </div>
                              {gh ? (
                                <>
                                  <div className="flex items-center justify-between py-1">
                                    <span className="text-fg-subtle text-xs">{t('table.starsAndForks')}</span>
                                    <span className="text-fg text-xs font-medium">⭐ {gh.stars ?? '—'} &nbsp;🍴 {gh.forks ?? '—'}</span>
                                  </div>
                                  <div className="flex items-center justify-between py-1">
                                    <span className="text-fg-subtle text-xs">{t('table.commitsThirtyDays')}</span>
                                    <span className="text-fg text-xs font-medium">{gh.commit_count_30d ?? '—'}</span>
                                  </div>
                                  <div className="flex items-center justify-between py-1">
                                    <span className="text-fg-subtle text-xs">{t('table.contributors')}</span>
                                    <span className="text-fg text-xs font-medium">
                                      {gh.contributors_count ?? (contribs.length > 0 ? contribs.length : '—')}
                                    </span>
                                  </div>
                                  {langs.length > 0 && (
                                    <div className="flex items-center justify-between py-1">
                                      <span className="text-fg-subtle text-xs">{t('table.mainLanguage')}</span>
                                      <span className="text-fg text-xs font-medium">{langs.map(([l]) => l).join(', ')}</span>
                                    </div>
                                  )}
                                  {gh.size_kb != null && (
                                    <div className="flex items-center justify-between py-1">
                                      <span className="text-fg-subtle text-xs">{t('table.repoSize')}</span>
                                      <span className="text-fg text-xs font-medium">{(gh.size_kb / 1024).toFixed(1)} MB</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between py-1">
                                    <span className="text-fg-subtle text-xs">{t('table.readme')}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${gh.has_readme ? 'bg-green-50 text-green-600 border-green-100' : 'bg-surface-2 text-fg-subtle border-token'}`}>{gh.has_readme ? '✓ 有' : '✗ 无'}</span>
                                  </div>
                                  <div className="flex items-center justify-between py-1">
                                    <span className="text-fg-subtle text-xs">测试</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${gh.has_tests ? 'bg-green-50 text-green-600 border-green-100' : 'bg-surface-2 text-fg-subtle border-token'}`}>{gh.has_tests ? '✓ 有' : '✗ 无'}</span>
                                  </div>
                                </>
                              ) : (
                                <div className="py-1 text-fg-subtle text-xs">无 GitHub 数据</div>
                              )}
                              {/* GitHub 用户 */}
                              {contribs[0]?.username && (
                                <div className="flex items-center justify-between py-1">
                                  <span className="text-fg-subtle text-xs">{t('table.githubUser')}</span>
                                  <a href={`https://github.com/${contribs[0].username}`} target="_blank" rel="noopener noreferrer"
                                    className="text-fg text-xs font-medium hover:text-blue-600 hover:underline">{contribs[0].username}</a>
                                </div>
                              )}
                              {/* Twitter */}
                              {ar?.web3_analysis?.twitter && (ar.web3_analysis.twitter.handle || ar.web3_analysis.twitter.username) && (
                                <div className="flex items-center justify-between py-1">
                                  <span className="text-fg-subtle text-xs">{t('table.twitter')}</span>
                                  <a
                                    href={`https://x.com/${ar.web3_analysis.twitter.handle || ar.web3_analysis.twitter.username}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-fg-muted hover:text-[var(--color-fg)] transition-colors"
                                  >
                                    <XIcon size={13} strokeWidth={2.5} />
                                    {(ar.web3_analysis.twitter.followers ?? ar.web3_analysis.twitter.followers_count) != null && (
                                      <span className="text-fg-subtle text-xs">{((ar.web3_analysis.twitter.followers ?? ar.web3_analysis.twitter.followers_count) as number).toLocaleString()}</span>
                                    )}
                                    {ar.web3_analysis.twitter.is_kol && (
                                      <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 font-medium leading-none">KOL</span>
                                    )}
                                  </a>
                                </div>
                              )}
                            </div>
                            {/* 贡献者列表 */}
                            {contribs.length > 0 && (
                              <div className="mt-3">
                                {/* Web3 综合评分 */}
                                {w3 && (w3.total_score ?? 0) > 0 && (
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-fg-subtle text-xs">{t('table.web3Score')}</span>
                                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">{w3.total_score}</span>
                                    {w3.top_ecosystem && <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-600 border border-purple-100">{w3.top_ecosystem}</span>}
                                  </div>
                                )}
                                <p className="text-fg-subtle text-xs mb-1.5">{t('table.contributors')} ({contribs.length})</p>
                                <div className="space-y-1">
                                  {contribs.map(c => (
                                    <div key={c.username} className="flex items-center gap-1.5 flex-wrap">
                                      <a href={`https://github.com/${c.username}`} target="_blank" rel="noopener noreferrer"
                                        className="text-fg-muted text-xs hover:text-blue-600 hover:underline">@{c.username}</a>
                                      {c.is_web3_dev && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-600 border border-green-100">Web3 ✓</span>
                                      )}
                                      {c.top_eco && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 border border-blue-100">{c.top_eco}</span>
                                      )}
                                      {(c.web3_score != null && c.web3_score > 0) && (
                                        <span className="text-fg-subtle text-[10px]">{c.web3_score}分</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 右列：评分 & 质量 */}
                          <div className="space-y-3">
                            <p className="font-semibold text-fg-muted text-xs mb-1">评分 &amp; 质量</p>
                            {/* 维度评分 */}
                            {dimensions && Object.keys(dimensions).length > 0 && (
                              <div className="space-y-1">
                                {Object.entries(dimensions).map(([dim, val]) => {
                                  const pct = Math.round((val / 10) * 100)
                                  const barColor = val >= 8 ? '#22c55e' : val >= 6 ? '#3b82f6' : val >= 4 ? '#f59e0b' : '#ef4444'
                                  return (
                                    <div key={dim}>
                                      <div className="flex justify-between mb-0.5">
                                        <span className="text-fg-muted text-[11px]">{dim}</span>
                                        <span className="text-fg-muted font-medium text-[11px]">{val}</span>
                                      </div>
                                      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            {/* 评委评分 */}
                            {revSubs.length > 0 && (
                              <div>
                                <p className="text-fg-subtle text-[10px] mb-1">{t('table.modelScore')}</p>
                                {reviewerMode ? (
                                  <div className="space-y-1">
                                    {revSubs.map(r => (
                                      <div key={r.model} className="flex items-center justify-between bg-bg rounded px-2 py-1 border border-token">
                                        <div className="flex items-center gap-1.5">
                                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: MODEL_COLOR[r.model] ?? '#6b7280' }} />
                                          <span className="text-xs text-fg-muted">{MODEL_LABEL[r.model] ?? r.model}</span>
                                          <span className="text-xs font-bold" style={{ color: scoreColor(r.score) }}>{r.score.toFixed(1)}</span>
                                        </div>
                                        {onAdjustScore && !submittedProjectIds?.has(project.id) && (
                                          <button onClick={() => onAdjustScore(project.id, r.model)}
                                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-fg-muted hover:text-[var(--color-fg)] bg-surface hover:bg-[var(--color-bg)] border border-token rounded transition-colors">
                                            <Pencil size={9} /> {t('table.adjustScore')}
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {revSubs.map(r => (
                                      <span key={r.model} className="flex items-center gap-1 px-1.5 py-0.5 bg-surface-2 rounded text-[10px]">
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: MODEL_COLOR[r.model] ?? '#6b7280' }} />
                                        {MODEL_LABEL[r.model] ?? r.model}: <strong>{r.score}</strong>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Reviewer submit action */}
                            {reviewerMode && onSubmitProject && (
                              <div className="pt-2 border-t border-token mt-1">
                                {submittedProjectIds?.has(project.id) ? (
                                  <div className="flex items-center justify-center gap-1 text-emerald-600 text-[10px] py-1">
                                    <CheckSquare size={10} /> {t('table.submitted')}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => onSubmitProject(project.id)}
                                    disabled={revSubs.length === 0}
                                    className="w-full px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-surface-2 disabled:text-fg-subtle text-white text-[11px] rounded-lg font-medium transition-colors">
                                    提交评分
                                  </button>
                                )}
                              </div>
                            )}
                            {/* SonarQube */}
                            {sonarM && (
                              <div>
                                <p className="text-fg-subtle text-[10px] mb-1">{t('table.sonarQuality')}</p>
                                <div className="grid grid-cols-3 gap-1 mb-2">
                                  {([
                                    [t('table.ncloc'), sonarM.ncloc],
                                    ['圈复杂度', sonarM.complexity],
                                    ['Bugs', sonarM.bugs],
                                    ['漏洞', sonarM.vulnerabilities],
                                    ['代码异味', sonarM.code_smells],
                                    [t('table.duplicateRate'), sonarM.duplicated_lines_density != null ? `${sonarM.duplicated_lines_density}%` : '—'],
                                  ] as [string, string|number|undefined][]).map(([label, val]) => (
                                    <div key={label} className="border border-token rounded p-1.5 bg-bg text-center">
                                      <div className="font-bold text-fg text-[11px]">{String(val ?? '—')}</div>
                                      <div className="text-fg-subtle text-[9px]">{label}</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  {([
                                    [t('table.maintainability'), sonarM.sqale_rating],
                                    [t('table.reliability'), sonarM.reliability_rating],
                                    [t('table.security'), sonarM.security_rating],
                                  ] as [string, string|number|undefined][]).map(([label, val]) => {
                                    const r = numToRating(val)
                                    return (
                                      <div key={label} className="text-center flex-1">
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs mx-auto"
                                          style={{ backgroundColor: ratingColor[r] ?? '#9ca3af' }}>
                                          {r}
                                        </div>
                                        <div className="text-fg-subtle text-[9px] mt-0.5">{label}</div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                        </div>
                      </td>
                    </tr>
                  )
                })()}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editProject} onOpenChange={open => !open && setEditProject(null)}>
        <DialogContent className="max-w-md bg-bg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-fg">编辑项目</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <ImageUpload
                value={editForm.logo_url ?? null}
                onChange={url => setEditForm(f => ({ ...f, logo_url: url || null }))}
                bucket="project-logos"
                path={editProject?.id ?? 'tmp'}
                label={t('upload.logo')}
                aspectRatio="square"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-fg-muted">{fl.name || t('table.colName')} *</Label>
              <Input value={editForm.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-fg-muted">{fl.github_url || 'GitHub 地址'}</Label>
              <Input value={editForm.github_url ?? ''} placeholder="https://github.com/..." onChange={e => setEditForm(f => ({ ...f, github_url: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-fg-muted">{fl.demo_url || '演示链接'}</Label>
              <Input value={editForm.demo_url ?? ''} placeholder="https://..." onChange={e => setEditForm(f => ({ ...f, demo_url: e.target.value }))} />
            </div>
            {/* team_name only if project has it */}
            {(editProject?.team_name !== undefined) && (
              <div className="space-y-1">
                <Label className="text-fg-muted">{fl.team_name || '团队名称'}</Label>
                <Input value={editForm.team_name ?? ''} onChange={e => setEditForm(f => ({ ...f, team_name: e.target.value }))} />
              </div>
            )}
            {/* Track */}
            {tracks.length > 0 && (
              <div className="space-y-1">
                <Label className="text-fg-muted">{t('track.label')}</Label>
                <div className="space-y-1">
                  {tracks.map(tr => (
                    <label key={tr.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={(editForm.track_ids ?? []).includes(tr.id)}
                        onChange={e => {
                          setEditForm(f => {
                            const ids = f.track_ids ?? []
                            return {
                              ...f,
                              track_ids: e.target.checked
                                ? [...ids, tr.id]
                                : ids.filter(id => id !== tr.id)
                            }
                          })
                        }}
                      />
                      <span className="text-fg-muted">{tr.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {/* Extra fields */}
            {Object.keys(editExtra).length > 0 && (
              <>
                <div className="border-t pt-3">
                  <p className="text-xs text-fg-subtle mb-2">扩展字段</p>
                  {Object.entries(editExtra).map(([k, v]) => (
                    <div key={k} className="space-y-1 mb-2">
                      <Label className="text-fg-muted text-xs">{k}</Label>
                      <Input value={v} onChange={e => setEditExtra(ex => ({ ...ex, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProject(null)}>取消</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
