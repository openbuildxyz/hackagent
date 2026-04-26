'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { MODEL_NAMES, MODEL_COLORS } from '@/lib/models'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, Github } from 'lucide-react'
import PublicNavbar from '@/components/PublicNavbar'
import PublicFooter from '@/components/PublicFooter'

type Dimension = { name: string; weight: number }

type Event = {
  id: string
  name: string
  track: string | null
  tracks: Array<{id: string; name: string}> | null
  description: string | null
  dimensions: Dimension[]
  models: string[]
  web3_enabled: boolean
  status: string
}

type Project = {
  id: string
  name: string
  github_url: string | null
  demo_url: string | null
  description: string | null
  track_ids: string[] | null
  team_name: string | null
  tags: string[] | null
}

type Score = {
  id: string
  project_id: string
  model: string
  dimension_scores: Record<string, number> | null
  overall_score: number | null
  comment: string | null
  web3_insight: string | null
  status: string
}

type ProjectWithScores = Project & {
  scores: Score[]
  avgScore: number
}

const RANK_MEDAL = ['🥇', '🥈', '🥉']
const PAGE_SIZE = 50

function getRankStyle(index: number) {
  if (index === 0) return {
    card: 'border-2 border-yellow-400 bg-yellow-400/10 dark:bg-yellow-400/15',
    scoreSizeClass: 'text-3xl',
  }
  if (index === 1) return {
    card: 'border-2 border-slate-400 bg-slate-400/10 dark:bg-slate-400/15',
    scoreSizeClass: 'text-2xl',
  }
  if (index === 2) return {
    card: 'border-2 border-orange-400 bg-orange-400/10 dark:bg-orange-400/15',
    scoreSizeClass: 'text-2xl',
  }
  return { card: '', scoreSizeClass: 'text-2xl' }
}

export default function ReportPage() {
  const params = useParams()
  const eventId = params.id as string
  const [event, setEvent] = useState<Event | null>(null)
  const [projects, setProjects] = useState<ProjectWithScores[]>([])
  const [loading, setLoading] = useState(true)
  const [activeModel, setActiveModel] = useState('all')
  const [activeTrack, setActiveTrack] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    setCurrentPage(1)
  }, [activeModel, activeTrack])

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch(`/api/events/${eventId}/public-report`)
      if (!res.ok) { setLoading(false); return }
      const { event: eventData, projects: projectData, scores: scoreData } = await res.json()

      if (!eventData) { setLoading(false); return }
      setEvent(eventData)

      const scoresByProject: Record<string, Score[]> = {}
      for (const s of scoreData ?? []) {
        if (!scoresByProject[s.project_id]) scoresByProject[s.project_id] = []
        scoresByProject[s.project_id].push(s)
      }

      const enriched: ProjectWithScores[] = (projectData ?? []).map((p: Project) => {
        const pScores = scoresByProject[p.id] ?? []
        const avg =
          pScores.length > 0
            ? pScores.reduce((sum, s) => sum + (s.overall_score ?? 0), 0) / pScores.length
            : 0
        return { ...p, scores: pScores, avgScore: avg }
      })

      setProjects(enriched)
      setLoading(false)
    }

    fetchData()
  }, [eventId])

  const getRanked = (model: string): ProjectWithScores[] => {
    return [...projects]
      .map((p) => {
        if (model === 'all') return p
        const s = p.scores.find((sc) => sc.model === model)
        return { ...p, avgScore: s?.overall_score ?? 0 }
      })
      .sort((a, b) => b.avgScore - a.avgScore)
  }

  const getScore = (p: ProjectWithScores, model: string): Score | undefined => {
    if (model === 'all') return undefined
    return p.scores.find((s) => s.model === model)
  }

  const getDisplayScore = (p: ProjectWithScores, model: string): number => {
    if (model === 'all') return p.avgScore
    return p.scores.find((s) => s.model === model)?.overall_score ?? 0
  }

  const getRadarData = (p: ProjectWithScores, model: string) => {
    if (!event) return []
    const score = model === 'all' ? undefined : getScore(p, model)
    if (model === 'all') {
      return event.dimensions.map((d) => {
        const vals = p.scores
          .map((s) => s.dimension_scores?.[d.name])
          .filter((v): v is number => v != null)
        const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
        return { name: d.name, score: parseFloat(avg.toFixed(1)) }
      })
    }
    return event.dimensions.map((d) => ({
      name: d.name,
      score: score?.dimension_scores?.[d.name] ?? 0,
    }))
  }

  const ranked = getRanked(activeModel).filter(p => activeTrack === 'all' || ((p as {project?: {track_ids?: string[]}}).project?.track_ids ?? (p as {track_ids?: string[]}).track_ids ?? []).includes(activeTrack))
  const totalPages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pagedRanked = ranked.slice(pageStart, pageStart + PAGE_SIZE)

  if (loading) {
    return (
      <div className="min-h-screen bg-surface">
        <PublicNavbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          {/* Title skeleton */}
          <div className="space-y-3">
            <div className="h-8 w-64 rounded-lg bg-surface-2 animate-pulse" />
            <div className="h-4 w-40 rounded bg-surface-2 animate-pulse" />
          </div>
          {/* Stats row */}
          <div className="flex gap-4">
            <div className="h-10 w-20 rounded-lg bg-surface-2 animate-pulse" />
            <div className="h-10 w-16 rounded-lg bg-surface-2 animate-pulse" />
            <div className="h-10 w-24 rounded-lg bg-surface-2 animate-pulse" />
          </div>
          {/* Table skeleton */}
          <div className="rounded-xl border border-token overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-4 border-b border-token last:border-0">
                <div className="h-5 w-6 rounded bg-surface-2 animate-pulse" />
                <div className="h-5 flex-1 rounded bg-surface-2 animate-pulse" />
                <div className="h-5 w-16 rounded bg-surface-2 animate-pulse" />
                <div className="h-5 w-12 rounded bg-surface-2 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-surface">
        <PublicNavbar />
        <div className="flex items-center justify-center py-24">
          <p className="text-muted-foreground">活动不存在或已被删除</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <PublicNavbar />
      {/* Header */}
      <div className="bg-bg border-b">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                AI 评审报告
              </p>
              <h1 className="text-2xl font-bold">{event.name}</h1>
              {event.track && (
                <p className="text-muted-foreground text-sm mt-1">{event.track}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge variant="outline" className="text-xs whitespace-nowrap">
                {projects.length} 个项目
              </Badge>
              <Badge variant="outline" className="text-xs whitespace-nowrap">
                {event.models.length} 个模型
              </Badge>
            </div>
          </div>

          {/* Model tabs */}
          <div className="mt-6 space-y-2">
            {event.tracks && event.tracks.length > 0 && (
              <Tabs value={activeTrack} onValueChange={setActiveTrack}>
                <TabsList className="h-auto flex-wrap gap-1 p-1">
                  <TabsTrigger value="all" className="text-xs px-3">全部赛道</TabsTrigger>
                  {event.tracks.map(tr => (
                    <TabsTrigger key={tr.id} value={tr.id} className="text-xs px-3">{tr.name}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            <Tabs value={activeModel} onValueChange={setActiveModel}>
              <TabsList className="h-auto flex-wrap gap-1 p-1">
                <TabsTrigger value="all" className="text-xs px-3">
                  综合排名
                </TabsTrigger>
                {event.models.map((m) => (
                  <TabsTrigger key={m} value={m} className="text-xs px-3">
                    {MODEL_NAMES[m] ?? m}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Ranking */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-3">
        {ranked.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground text-sm">暂无评审数据</p>
            </CardContent>
          </Card>
        )}

        {pagedRanked.map((project, pageIndex) => {
          const index = pageStart + pageIndex
          const score = getDisplayScore(project, activeModel)
          const modelScore = getScore(project, activeModel)
          const isExpanded = expandedId === project.id
          const radarData = getRadarData(project, activeModel)
          const isTopThree = index < 3
          const { card: rankCardClass, scoreSizeClass } = getRankStyle(index)

          return (
            <Card
              key={project.id}
              className={`overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${rankCardClass}`}
              onClick={() => setExpandedId(isExpanded ? null : project.id)}
            >
              {/* Medal header for top 3 */}
              {isTopThree && (
                <div className="px-6 pt-4 pb-0 flex items-center gap-2">
                  <span className="text-2xl leading-none">{RANK_MEDAL[index]}</span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    第 {index + 1} 名
                  </span>
                </div>
              )}

              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  {/* Rank badge (4th and beyond) */}
                  {!isTopThree && (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-surface-2 text-fg-muted border border-token tabular-nums">
                      {index + 1}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle className={`truncate ${isTopThree ? 'text-lg' : 'text-base'}`}>
                        {project.name}
                      </CardTitle>
                      {project.github_url && (
                        <a
                          href={project.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Github size={14} />
                        </a>
                      )}
                      {project.demo_url && (
                        <a
                          href={project.demo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                    {project.team_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{project.team_name}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      {score > 0 ? (
                        <>
                          <p className={`font-bold tabular-nums ${scoreSizeClass}`}>
                            {score.toFixed(1)}
                          </p>
                          <p className="text-xs text-muted-foreground">/ 10</p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground whitespace-nowrap">暂无评分</p>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={16} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown size={16} className="text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Per-model score chips (shown in "all" tab) */}
                {activeModel === 'all' && project.scores.length > 0 && (
                  <div className={`flex flex-wrap gap-1.5 mt-2 ${isTopThree ? '' : 'pl-11'}`}>
                    {project.scores.map((s) => (
                      <span
                        key={s.model}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          MODEL_COLORS[s.model] ?? 'bg-surface-2 text-fg-muted'
                        }`}
                      >
                        {MODEL_NAMES[s.model] ?? s.model}: {s.overall_score?.toFixed(1) ?? '—'}
                      </span>
                    ))}
                  </div>
                )}
              </CardHeader>

              {/* Expanded content */}
              {isExpanded && (
                <CardContent className="border-t pt-4">
                  <div className={`${isTopThree ? '' : 'pl-11'} space-y-4`}>
                    {/* Radar chart */}
                    {radarData.length > 0 && radarData.some((d) => d.score > 0) && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">维度得分</p>
                        <ResponsiveContainer width="100%" height={220}>
                          <RadarChart data={radarData}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                            <Tooltip
                              formatter={(value: unknown) => [(value as number).toFixed(1), '得分']}
                              contentStyle={{ fontSize: 12 }}
                            />
                            <Radar
                              dataKey="score"
                              stroke="#6366f1"
                              fill="#6366f1"
                              fillOpacity={0.3}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* AI comment (single model) */}
                    {activeModel !== 'all' && modelScore?.comment && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">AI 评语</p>
                        <p className="text-sm leading-relaxed">{modelScore.comment}</p>
                      </div>
                    )}

                    {/* All models comments */}
                    {activeModel === 'all' && (
                      <div className="space-y-3">
                        {project.scores.map((s) => (
                          s.comment && (
                            <div key={s.model}>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mb-1 ${
                                  MODEL_COLORS[s.model] ?? 'bg-surface-2 text-fg-muted'
                                }`}
                              >
                                {MODEL_NAMES[s.model] ?? s.model}
                              </span>
                              <p className="text-sm leading-relaxed">{s.comment}</p>
                            </div>
                          )
                        ))}
                      </div>
                    )}

                    {/* Web3 insight */}
                    {activeModel !== 'all' && modelScore?.web3_insight && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Web3 洞察</p>
                        <p className="text-sm leading-relaxed text-blue-700 dark:text-blue-400">{modelScore.web3_insight}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
            >
              <ChevronLeft size={14} />
              上一页
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              第 {safePage} 页 / 共 {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
            >
              下一页
              <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-6 pb-10">
        <p className="text-xs text-center text-muted-foreground">
          Powered by HackAgent · AI-driven Hackathon Review Platform
        </p>
      </div>

      <PublicFooter />
    </div>
  )
}
