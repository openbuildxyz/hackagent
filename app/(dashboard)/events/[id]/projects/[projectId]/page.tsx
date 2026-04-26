'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Github, Globe, RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useT, useLocale, getSummary } from '@/lib/i18n'
import type { BilingualSummary } from '@/lib/i18n'
import { formatDate } from '@/lib/format-date'

// ── Types ──────────────────────────────────────────────────────────────────
type AiReview = {
  model: string; score: number
  dimensions: Record<string, number>
  summary: string | BilingualSummary; web3_insight?: string; error?: boolean
}
type GhAnalysis = {
  stars?: number; forks?: number; contributors_count?: number; commit_count_30d?: number
  is_fork?: boolean; fake_code_flags?: string[]
  languages?: Record<string, { bytes: number; pct: number }>
  has_readme?: boolean; has_tests?: boolean; total_files?: number; size_kb?: number
  llm_code_analysis?: { is_real_code?: boolean | null; business_match_score?: number | null; code_quality_summary?: string }
  topics?: string[]
}
type Web3Insight = {
  total_score?: number; ecosystems?: Array<{ name: string; score: number; repo_count: number }>
  top_ecosystem?: string; is_web3_developer?: boolean; repo_count?: number
}
type SonarMetrics = {
  bugs?: string | number; vulnerabilities?: string | number; code_smells?: string | number
  duplicated_lines_density?: string | number; ncloc?: string | number; lines?: string | number
  reliability_rating?: string; security_rating?: string; sqale_rating?: string
  complexity?: string | number; cognitive_complexity?: string | number; coverage?: string | number
}
type SonarAnalysis = {
  status?: string; metrics?: SonarMetrics; size_mb?: number; project_key?: string
  bugs?: string | number; vulnerabilities?: string | number; code_smells?: string | number
  duplicated_lines_density?: string | number; ncloc?: string | number
  reliability_rating?: string; security_rating?: string; sqale_rating?: string
}
type AnalysisResult = {
  ai_reviews?: AiReview[]
  github_analysis?: GhAnalysis
  web3_analysis?: { web3insight?: Web3Insight; contributors?: Array<{ username: string; web3_score?: number; is_web3_dev?: boolean; top_eco?: string }>; github_username?: string }
  sonar_analysis?: SonarAnalysis
  analyzed_at?: string
}
type Project = {
  id: string; name: string; github_url: string | null; demo_url: string | null
  team_name: string | null; description: string | null; tags?: string[]
  analysis_status: string | null
  reviewer_submissions: AiReview[] | null
  analysis_result: AnalysisResult | null
}
type EventData = {
  id: string; name: string
  dimensions: Array<{ name: string; weight: number; description?: string }>
  models: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────
const MODEL_LABEL: Record<string, string> = {
  minimax: 'MiniMax M2.5', claude: 'Claude Sonnet 4.6', gemini: 'Gemini 2.5 Flash',
  gpt4o: 'GPT-4o', deepseek: 'DeepSeek V3.2', kimi: 'Kimi K2.5', glm: 'GLM 5',
}
const MODEL_COLOR: Record<string, string> = {
  minimax: '#3b82f6', claude: '#f97316', gemini: '#22c55e',
  gpt4o: '#a855f7', deepseek: '#06b6d4', kimi: '#ec4899', glm: '#6366f1',
}
const RATING_COLOR: Record<string, string> = {
  A: '#22c55e', B: '#86efac', C: '#facc15', D: '#f97316', E: '#ef4444',
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}
function scoreColor(v: number) {
  if (v >= 8) return '#22c55e'
  if (v >= 6) return '#3b82f6'
  if (v >= 4) return '#f59e0b'
  return '#ef4444'
}
function ratingBg(r?: string) { return RATING_COLOR[r ?? ''] ?? '#6e7681' }
function langColor(lang: string) {
  return `hsl(${lang.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360},60%,55%)`
}

// ── Radar Chart (pure SVG) ─────────────────────────────────────────────────
function RadarChart({ dims, dimAvgs }: { dims: Array<{ name: string; weight: number }>, dimAvgs: Record<string, number> }) {
  const size = 240
  const cx = size / 2
  const cy = size / 2
  const r = 85
  const n = dims.length
  if (n < 3) return null

  const angle = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2
  const pt = (i: number, ratio: number) => ({
    x: cx + r * ratio * Math.cos(angle(i)),
    y: cy + r * ratio * Math.sin(angle(i)),
  })

  const rings = [0.25, 0.5, 0.75, 1.0]
  const ringPaths = rings.map(ratio => {
    const pts = dims.map((_, i) => pt(i, ratio))
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'
  })

  const scorePts = dims.map((d, i) => {
    const v = Math.min(10, Math.max(0, dimAvgs[d.name] ?? 0)) / 10
    return pt(i, v)
  })
  const scorePath = scorePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {ringPaths.map((d, i) => <path key={i} d={d} fill="none" stroke="#e5e7eb" strokeWidth="1" />)}
      {dims.map((_, i) => {
        const p = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke="#e5e7eb" strokeWidth="1" />
      })}
      <path d={scorePath} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="2" />
      {scorePts.map((p, i) => <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="3.5" fill="#3b82f6" />)}
      {dims.map((d, i) => {
        const p = pt(i, 1.28)
        const label = d.name.length > 5 ? d.name.slice(0, 5) + '…' : d.name
        return (
          <text key={i} x={p.x.toFixed(1)} y={p.y.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#6b7280">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

// ── Card Shell ─────────────────────────────────────────────────────────────
function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-bg border border-token rounded-xl p-4 ${className ?? ''}`}>
      {title && (
        <div className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3 pb-2 border-b border-token">
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ProjectReportPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string
  const projectId = params.projectId as string
  const t = useT()
  const [locale] = useLocale()

  const [project, setProject] = useState<Project | null>(null)
  const [event, setEvent] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({})

  useEffect(() => {
    Promise.all([
      fetch(`/api/events/${eventId}`).then(r => r.json()),
      fetch(`/api/projects/${projectId}`).then(r => r.json()),
    ]).then(([evtData, projData]) => {
      setEvent(evtData)
      setProject(projData)
    }).catch(() => toast.error(t('report.loadFailed')))
      .finally(() => setLoading(false))
  }, [eventId, projectId, t])

  const reanalyze = async () => {
    if (!event?.models?.length) return
    setReanalyzing(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: event.models, sonarEnabled: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('common.analysisFailed'))
      const updated = await fetch(`/api/projects/${projectId}`).then(r => r.json())
      setProject(updated)
      toast.success(t('common.reanalyzeSuccess'))
    } catch (e) { toast.error(String(e)) }
    finally { setReanalyzing(false) }
  }

  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <Loader2 className="animate-spin text-blue-500" size={32} />
    </div>
  )
  if (!project || !event) return (
    <div className="min-h-screen bg-surface flex items-center justify-center text-fg-muted">{t('report.notFound')}</div>
  )

  // ── Data derivations ──────────────────────────────────────────────────────
  const ar = project.analysis_result
  const aiReviews: AiReview[] = (ar?.ai_reviews ?? project.reviewer_submissions ?? []).filter(r => !r.error && (r.score ?? 0) > 0)
  const gh = ar?.github_analysis ?? null
  const sonarRaw = ar?.sonar_analysis ?? null
  const sonarM = sonarRaw?.metrics ?? sonarRaw ?? null
  const numToRating = (v?: string | number) => {
    if (!v) return undefined
    const n = Math.round(Number(v))
    return ['A', 'B', 'C', 'D', 'E'][n - 1] ?? String(v)
  }
  const sonar = sonarM ? {
    bugs: sonarM.bugs, vulnerabilities: sonarM.vulnerabilities, code_smells: sonarM.code_smells,
    duplicated_lines_density: sonarM.duplicated_lines_density, ncloc: sonarM.ncloc,
    complexity: (sonarM as SonarMetrics).complexity,
    reliability_rating: numToRating(sonarM.reliability_rating),
    security_rating: numToRating(sonarM.security_rating),
    sqale_rating: numToRating(sonarM.sqale_rating),
  } : null
  const web3Data = ar?.web3_analysis ?? null
  const w3 = web3Data?.web3insight ?? null
  const dims = event.dimensions ?? []

  const avgScore = aiReviews.length ? aiReviews.reduce((s, r) => s + r.score, 0) / aiReviews.length : null
  const dimAvgs: Record<string, number> = {}
  if (aiReviews.length > 0 && dims.length > 0) {
    for (const d of dims) {
      const vals = aiReviews.map(r => r.dimensions?.[d.name]).filter((v): v is number => typeof v === 'number')
      if (vals.length) dimAvgs[d.name] = vals.reduce((a, b) => a + b, 0) / vals.length
    }
  }

  const llm = gh?.llm_code_analysis
  const fakeFlags = gh?.fake_code_flags ?? []
  const langs = gh?.languages ? Object.entries(gh.languages).sort((a, b) => (b[1].pct ?? 0) - (a[1].pct ?? 0)) : []
  const topLangs = langs.slice(0, 6)

  const hasLlmFake = fakeFlags.includes('llm_fake_code')
  const codeStatusLabel = fakeFlags.length === 0 ? t('report.codeStatusNormal') : hasLlmFake ? t('report.codeStatusSuspect') : t('report.codeStatusWarning')
  const codeStatusColor = fakeFlags.length === 0 ? '#22c55e' : hasLlmFake ? '#ef4444' : '#f59e0b'

  const fakeFlagLabels: Record<string, string> = {
    new_account_sole_contributor: t('report.fakeFlagNewAccount'),
    mostly_non_code: t('report.fakeFlagNonCode'),
    llm_fake_code: t('report.fakeFlagLlm'),
  }

  // Best scoring model for the blockquote
  const bestReview = aiReviews.length > 0
    ? aiReviews.reduce((a, b) => b.score > a.score ? b : a, aiReviews[0])
    : null
  const bestSummary = bestReview ? getSummary(bestReview.summary, locale) : ''

  const desc = project.description ?? ''
  const showDescToggle = desc.length > 150

  const hasData = aiReviews.length > 0 || !!gh || !!sonar

  return (
    <div className="min-h-screen bg-surface text-fg">

      {/* Sticky Header */}
      <div className="bg-bg border-b border-token sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <button onClick={() => router.back()}
            className="flex items-center gap-2 text-fg-muted hover:text-[var(--color-fg)] text-sm transition-colors">
            <ArrowLeft size={15} /> {t('report.back')}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted hidden sm:block">{event.name}</span>
            <button onClick={reanalyze} disabled={reanalyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
              <RefreshCw size={12} className={reanalyzing ? 'animate-spin' : ''} />
              {reanalyzing ? t('report.analyzing') : t('report.reanalyze')}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ── Hero Header ── */}
        <div className="bg-bg border border-token rounded-xl p-6">
          <div className="flex items-start justify-between gap-6">
            {/* Left: name + links + description + tags */}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-black text-fg mb-1">{project.name}</h1>
              {project.team_name && (
                <div className="text-sm text-fg-muted mb-3">👥 {project.team_name}</div>
              )}

              {/* Links */}
              <div className="flex gap-2 mb-4">
                {project.github_url && (
                  <a href={project.github_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-2 border border-token rounded-md hover:border-[var(--color-border-strong)] text-fg-muted transition-colors">
                    <Github size={13} /> GitHub
                  </a>
                )}
                {project.demo_url && (
                  <a href={project.demo_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-2 border border-token rounded-md hover:border-[var(--color-border-strong)] text-fg-muted transition-colors">
                    <Globe size={13} /> Demo
                  </a>
                )}
              </div>

              {/* Description with collapse */}
              {desc && (
                <div className="mb-3">
                  <p className={`text-fg text-sm leading-relaxed ${!descExpanded && showDescToggle ? 'line-clamp-3' : ''}`}>
                    {desc}
                  </p>
                  {showDescToggle && (
                    <button onClick={() => setDescExpanded(v => !v)}
                      className="text-xs text-blue-500 hover:text-blue-700 mt-1 transition-colors">
                      {descExpanded ? t('common.collapse') : t('common.expand')}
                    </button>
                  )}
                </div>
              )}

              {/* Tags */}
              {project.tags && project.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {project.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full border border-blue-100">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Overall Score card */}
            {avgScore !== null && (
              <div className="shrink-0 flex flex-col items-center bg-surface rounded-2xl px-8 py-6 border border-token min-w-32">
                <div className="text-7xl font-black leading-none tabular-nums" style={{ color: scoreColor(avgScore) }}>
                  {avgScore.toFixed(1)}
                </div>
                <div className="text-xs font-medium text-fg-muted mt-2">{t('report.overallScore')}</div>
                {aiReviews.length > 1 && (
                  <div className="text-[10px] text-fg-subtle mt-0.5">{aiReviews.length} models avg</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* No data state */}
        {!hasData && (
          <div className="bg-bg border border-token rounded-xl p-12 text-center">
            <AlertTriangle className="mx-auto mb-3 text-fg-subtle" size={40} />
            <div className="text-fg-muted mb-4">{t('report.noData')}</div>
            <button onClick={reanalyze} disabled={reanalyzing}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {reanalyzing && <Loader2 size={14} className="animate-spin inline mr-1" />}
              {t('report.startAnalysis')}
            </button>
          </div>
        )}

        {hasData && (
          <>
            {/* ── Row 1: GitHub | Dimension Scores | Radar ── */}
            <div className="grid grid-cols-3 gap-5">

              {/* Left: GitHub data */}
              {gh ? (
                <Card title={t('report.codeAndDev')}>
                  {/* Code status */}
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-token">
                    <span className="text-xs text-fg-muted">{t('report.codeStatus')}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ color: codeStatusColor, backgroundColor: `${codeStatusColor}18` }}>
                      {codeStatusLabel}
                    </span>
                  </div>

                  {/* Stats 2×2 */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { label: '⭐ Stars', value: fmt(gh.stars) },
                      { label: '🍴 Forks', value: fmt(gh.forks) },
                      { label: `📝 ${t('report.stats.stars30d')}`, value: fmt(gh.commit_count_30d) },
                      { label: `👥 ${t('report.stats.contributors')}`, value: fmt(gh.contributors_count) },
                    ].map(s => (
                      <div key={s.label} className="bg-surface rounded-lg p-2 text-center">
                        <div className="text-sm font-bold text-fg">{s.value}</div>
                        <div className="text-[10px] text-fg-muted mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Metadata rows */}
                  <div className="space-y-1.5 mb-3">
                    {gh.size_kb !== undefined && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-fg-muted">{t('report.repoSize')}</span>
                        <span className="text-fg">{fmt(Math.round(gh.size_kb / 1024))} MB</span>
                      </div>
                    )}
                    {gh.total_files !== undefined && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-fg-muted">{t('report.fileCount')}</span>
                        <span className="text-fg">{fmt(gh.total_files)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-fg-muted">README</span>
                      <span style={{ color: gh.has_readme ? '#22c55e' : '#ef4444' }}>{gh.has_readme ? '✓' : '✗'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-fg-muted">Tests</span>
                      <span style={{ color: gh.has_tests ? '#22c55e' : '#ef4444' }}>{gh.has_tests ? '✓' : '✗'}</span>
                    </div>
                    {web3Data?.github_username && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-fg-muted">GitHub</span>
                        <span className="text-blue-500">@{web3Data.github_username}</span>
                      </div>
                    )}
                  </div>

                  {/* Language distribution */}
                  {topLangs.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] text-fg-muted mb-1.5">{t('report.langDist')}</div>
                      <div className="flex h-2 rounded-full overflow-hidden gap-px mb-2">
                        {topLangs.map(([lang, info]) => (
                          <div key={lang} title={`${lang}: ${info.pct?.toFixed(1)}%`}
                            style={{ width: `${info.pct ?? 0}%`, backgroundColor: langColor(lang) }} />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {topLangs.map(([lang, info]) => (
                          <span key={lang} className="flex items-center gap-1 text-[10px] text-fg-muted">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: langColor(lang) }} />
                            {lang} {info.pct?.toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LLM analysis */}
                  {llm && llm.business_match_score !== null && llm.business_match_score !== undefined && (
                    <div className="pt-3 border-t border-token">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-fg-muted">{t('report.businessMatch')}</span>
                        <span style={{ color: scoreColor(llm.business_match_score) }}>{llm.business_match_score}/10</span>
                      </div>
                      {llm.code_quality_summary && (
                        <p className="text-[10px] text-fg-muted leading-relaxed">{llm.code_quality_summary}</p>
                      )}
                    </div>
                  )}

                  {/* Fake flags */}
                  {fakeFlags.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-token flex flex-wrap gap-1">
                      {fakeFlags.map(f => (
                        <span key={f} className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-[10px]">
                          {fakeFlagLabels[f] ?? f}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              ) : (
                <div className="bg-surface border border-dashed border-token rounded-xl p-4 flex items-center justify-center text-xs text-fg-subtle">
                  {t('report.codeAndDev')} —
                </div>
              )}

              {/* Middle: Dimension score averages */}
              {dims.length > 0 && Object.keys(dimAvgs).length > 0 ? (
                <Card title={t('report.dimensionScores')}>
                  <div className="space-y-3">
                    {dims.map(d => {
                      const v = dimAvgs[d.name]
                      if (v === undefined) return null
                      const pct = Math.min(100, (v / 10) * 100)
                      const color = scoreColor(v)
                      return (
                        <div key={d.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-fg-muted">{d.name}</span>
                            <span className="text-xs font-bold tabular-nums" style={{ color }}>{v.toFixed(1)}</span>
                          </div>
                          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              ) : (
                <div className="bg-surface border border-dashed border-token rounded-xl p-4 flex items-center justify-center text-xs text-fg-subtle">
                  {t('report.dimensionScores')} —
                </div>
              )}

              {/* Right: Radar chart */}
              {dims.length >= 3 && Object.keys(dimAvgs).length >= 3 ? (
                <Card title={t('report.radarChart')}>
                  <RadarChart dims={dims} dimAvgs={dimAvgs} />
                </Card>
              ) : (
                <div className="bg-surface border border-dashed border-token rounded-xl p-4 flex items-center justify-center text-xs text-fg-subtle">
                  {t('report.radarChart')} —
                </div>
              )}
            </div>

            {/* ── Row 2: Model cards (2/3) | Best model summary (1/3) ── */}
            {aiReviews.length > 0 && (
              <div className="grid grid-cols-3 gap-5">

                {/* Left (col-span-2): model score cards in 2-col grid */}
                <div className="col-span-2">
                  <Card title={t('report.modelReviews')}>
                    <div className="grid grid-cols-2 gap-3">
                      {aiReviews.map(r => {
                        const color = MODEL_COLOR[r.model] ?? '#6b7280'
                        const label = MODEL_LABEL[r.model] ?? r.model
                        const summary = getSummary(r.summary, locale)
                        const showToggle = summary.length > 100
                        const expanded = expandedSummaries[r.model] ?? false
                        return (
                          <div key={r.model} className="bg-surface border border-token rounded-xl p-3">
                            {/* Model header */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                <span className="text-xs font-semibold text-fg truncate">{label}</span>
                              </div>
                              <span className="text-lg font-black tabular-nums shrink-0" style={{ color: scoreColor(r.score) }}>
                                {r.score}
                              </span>
                            </div>

                            {/* Per-dimension scores */}
                            {dims.length > 0 && (
                              <div className="space-y-1.5 mb-2">
                                {dims.map(d => {
                                  const v = r.dimensions?.[d.name]
                                  if (v === undefined) return null
                                  const pct = Math.min(100, (v / 10) * 100)
                                  return (
                                    <div key={d.name}>
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[10px] text-fg-muted truncate">{d.name}</span>
                                        <span className="text-[10px] font-semibold tabular-nums" style={{ color: scoreColor(v) }}>{v}</span>
                                      </div>
                                      <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* AI summary (collapsible) */}
                            {summary && (
                              <div className="pt-2 border-t border-token">
                                <p className={`text-[10px] text-fg-muted leading-relaxed ${!expanded && showToggle ? 'line-clamp-2' : ''}`}>
                                  {summary}
                                </p>
                                {showToggle && (
                                  <button
                                    onClick={() => setExpandedSummaries(prev => ({ ...prev, [r.model]: !prev[r.model] }))}
                                    className="text-[10px] text-blue-500 hover:text-blue-700 mt-0.5 transition-colors">
                                    {expanded ? t('common.collapse') : t('common.expand')}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                </div>

                {/* Right (col-span-1): best model full summary blockquote */}
                <div className="col-span-1">
                  {bestSummary && bestReview ? (
                    <Card title={t('report.topModelSummary')} className="h-full">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: MODEL_COLOR[bestReview.model] ?? '#6b7280' }} />
                        <span className="text-xs font-semibold text-fg-muted">
                          {MODEL_LABEL[bestReview.model] ?? bestReview.model}
                        </span>
                        <span className="ml-auto text-sm font-black tabular-nums"
                          style={{ color: scoreColor(bestReview.score) }}>
                          {bestReview.score}
                        </span>
                      </div>
                      <blockquote className="border-l-4 border-blue-300 pl-3">
                        <p className="text-xs text-fg-muted leading-relaxed">{bestSummary}</p>
                      </blockquote>
                    </Card>
                  ) : (
                    <div className="bg-surface border border-dashed border-token rounded-xl p-4 h-full flex items-center justify-center text-xs text-fg-subtle">
                      {t('report.topModelSummary')} —
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Row 3: SonarQube | Web3 Analysis | Core Contributors ── */}
            <div className="grid grid-cols-3 gap-5">

              {/* Left: SonarQube */}
              {sonar && (sonar.ncloc != null || sonar.bugs != null) ? (
                <Card title={t('report.sonarQuality')}>
                  {/* Rating badges */}
                  <div className="flex justify-around mb-4">
                    {[
                      { label: t('report.sonar.reliability'), rating: sonar.reliability_rating },
                      { label: t('report.sonar.security'), rating: sonar.security_rating },
                      { label: t('report.sonar.maintainability'), rating: sonar.sqale_rating },
                    ].map(({ label, rating }) => (
                      <div key={label} className="flex flex-col items-center gap-1.5">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm"
                          style={{ backgroundColor: ratingBg(rating) }}>
                          {rating ?? '?'}
                        </div>
                        <div className="text-[10px] text-fg-muted text-center">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { label: t('report.sonar.bugs'), value: String(sonar.bugs ?? '—') },
                      { label: t('report.sonar.vulnerabilities'), value: String(sonar.vulnerabilities ?? '—') },
                      { label: t('report.sonar.codeSmells'), value: fmt(Number(sonar.code_smells)) },
                      { label: t('report.sonar.lines'), value: fmt(Number(sonar.ncloc)) },
                    ].map(s => (
                      <div key={s.label} className="bg-surface rounded-lg p-2 text-center">
                        <div className="text-sm font-bold text-fg">{s.value}</div>
                        <div className="text-[10px] text-fg-muted mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Duplication bar */}
                  {sonar.duplicated_lines_density !== undefined && (
                    <div>
                      <div className="flex justify-between text-[10px] text-fg-muted mb-1">
                        <span>{t('report.sonar.dupCode')}</span>
                        <span>{Number(sonar.duplicated_lines_density).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-yellow-400"
                          style={{ width: `${Math.min(100, Number(sonar.duplicated_lines_density))}%` }} />
                      </div>
                    </div>
                  )}
                </Card>
              ) : (
                <div className="bg-surface border border-dashed border-token rounded-xl p-4 flex items-center justify-center text-xs text-fg-subtle">
                  {t('report.sonarQuality')} —
                </div>
              )}

              {/* Middle: Web3 analysis */}
              {w3 ? (
                <Card title={t('report.web3Analysis')}>
                  {/* Total score */}
                  {w3.total_score !== undefined && (
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-token">
                      <span className="text-xs text-fg-muted">{t('report.web3TotalScore')}</span>
                      <span className="text-xl font-black tabular-nums" style={{ color: scoreColor(w3.total_score) }}>
                        {w3.total_score}
                      </span>
                    </div>
                  )}

                  {/* Main ecosystem */}
                  {w3.top_ecosystem && (
                    <div className="flex items-center justify-between mb-3 text-xs">
                      <span className="text-fg-muted">{t('report.web3MainEco')}</span>
                      <span className="font-semibold text-fg bg-blue-50 px-2 py-0.5 rounded-full text-[11px]">
                        {w3.top_ecosystem}
                      </span>
                    </div>
                  )}

                  {/* Ecosystem list */}
                  {w3.ecosystems && w3.ecosystems.length > 0 && (
                    <div>
                      <div className="text-[10px] text-fg-subtle mb-2 uppercase tracking-wider">{t('report.web3Ecosystems')}</div>
                      <div className="space-y-2">
                        {w3.ecosystems.slice(0, 5).map(eco => (
                          <div key={eco.name} className="flex items-center gap-2">
                            <div className="w-20 text-[10px] text-fg-muted truncate shrink-0">{eco.name}</div>
                            <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.min(100, eco.score * 10)}%` }} />
                            </div>
                            <div className="text-[10px] text-fg-muted w-6 text-right shrink-0 tabular-nums">{eco.score}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ) : (
                <div className="bg-surface border border-dashed border-token rounded-xl p-4 flex items-center justify-center text-xs text-fg-subtle">
                  {t('report.web3Analysis')} —
                </div>
              )}

              {/* Right: Core contributors */}
              {web3Data?.contributors && web3Data.contributors.length > 0 ? (
                <Card title={t('report.contributors')}>
                  <div className="space-y-3">
                    {web3Data.contributors.slice(0, 6).map(c => (
                      <div key={c.username} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Avatar placeholder */}
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                            {c.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs text-fg truncate font-medium">@{c.username}</div>
                            {c.top_eco && (
                              <div className="text-[10px] text-fg-subtle truncate">{c.top_eco}</div>
                            )}
                          </div>
                          {c.is_web3_dev && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded border border-blue-100 shrink-0">
                              Web3
                            </span>
                          )}
                        </div>
                        {c.web3_score !== undefined && (
                          <span className="text-sm font-black shrink-0 tabular-nums" style={{ color: scoreColor(c.web3_score) }}>
                            {c.web3_score}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              ) : (
                <div className="bg-surface border border-dashed border-token rounded-xl p-4 flex items-center justify-center text-xs text-fg-subtle">
                  {t('report.contributors')} —
                </div>
              )}
            </div>
          </>
        )}

        {ar?.analyzed_at && (
          <div className="text-center text-xs text-fg-subtle pb-4">
            {t('report.analyzedAt')}{formatDate(ar.analyzed_at, locale)}
          </div>
        )}
      </div>
    </div>
  )
}
