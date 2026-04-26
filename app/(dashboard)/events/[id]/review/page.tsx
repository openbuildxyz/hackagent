'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Play,
  CheckCircle,
  AlertCircle,
  Loader2,
  Pencil,
  CheckCircle2,
  Clock,
  Trophy,
  Users,
} from 'lucide-react'
import { MODEL_NAMES, MODEL_COLORS, MODEL_CREDITS } from '@/lib/models'

type Event = {
  id: string
  name: string
  models: string[]
  dimensions: Array<{ name: string; weight: number }>
  web3_enabled: boolean
  status: string
  mode: string
}

type Score = {
  id: string
  project_id: string
  model: string
  dimension_scores: Record<string, number>
  overall_score: number
  final_dimension_scores: Record<string, number> | null
  final_overall_score: number | null
  comment: string | null
  projects?: { name: string; team_name: string | null }
}

type ReviewerStatus = {
  user_id: string
  email: string
  scored: number
  total: number
  done: boolean
}

type PanelRankEntry = {
  project_id: string
  name: string
  team_name: string | null
  avg_score: number
  reviewer_count: number
}

type PanelResult = {
  reviewer_count: number
  project_count: number
  all_done: boolean
  reviewer_status: ReviewerStatus[]
  ranking: PanelRankEntry[]
}

export default function ReviewPage() {
  const params = useParams()
  const eventId = params.id as string
  const router = useRouter()

  const [event, setEvent] = useState<Event | null>(null)
  const [projectCount, setProjectCount] = useState(0)
  const [credits, setCredits] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [progressCompleted, setProgressCompleted] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [failedCount, setFailedCount] = useState(0)
  const [currentProject, setCurrentProject] = useState('')
  const [currentModel, setCurrentModel] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // AI-only: score editing
  const [scores, setScores] = useState<Score[]>([])
  const [editScoreOpen, setEditScoreOpen] = useState(false)
  const [editingScore, setEditingScore] = useState<Score | null>(null)
  const [editDimValues, setEditDimValues] = useState<Record<string, number>>({})
  const [savingScore, setSavingScore] = useState(false)

  // Panel mode results
  const [panelResult, setPanelResult] = useState<PanelResult | null>(null)
  const [loadingPanel, setLoadingPanel] = useState(false)
  const [localWeb3, setLocalWeb3] = useState(false)
  const [localSonar, setLocalSonar] = useState(false)
  const [localModels, setLocalModels] = useState<string[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const [eventRes, creditRes] = await Promise.all([
        fetch(`/api/events/${eventId}`),
        fetch(`/api/events/${eventId}/credit-check`),
      ])

      if (!eventRes.ok) {
        router.push('/dashboard')
        return
      }

      const eventData = await eventRes.json()
      setEvent(eventData)
      setLocalModels(eventData.models ?? [])
      setLocalWeb3(eventData.web3_enabled ?? false)
      setLocalSonar((eventData as Record<string, unknown>).sonar_enabled as boolean ?? false)

      if (creditRes.ok) {
        const creditData = await creditRes.json()
        setProjectCount(creditData.projectCount)
        setCredits(creditData.credits)
      }

      if (eventData.status === 'judging') {
        // Verify queue actually has tasks before setting reviewing=true
        try {
          const queueRes = await fetch(`/api/events/${eventId}/batch-preanalyze`)
          if (queueRes.ok) {
            const queueData = await queueRes.json()
            const hasActiveTasks = (queueData.pending ?? 0) > 0 || (queueData.running ?? 0) > 0
            if (hasActiveTasks) {
              setReviewing(true)
              startPolling()
            }
            // else: queue is empty, don't set reviewing - show the Start button
          } else {
            // Can't check queue, default to showing start button
          }
        } catch {
          // Silently ignore, show start button
        }
      } else if (eventData.status === 'done') {
        setDone(true)
        if (eventData.mode === 'ai_only') {
          fetchScores()
        }
      }
      if (eventData.mode === 'panel_review') {
        fetchPanelResult()
      }

      setLoading(false)
    }

    fetchData()

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const fetchScores = async () => {
    const res = await fetch(`/api/events/${eventId}/scores`)
    if (res.ok) {
      const data = await res.json()
      setScores(data)
      // Count failed scores
      const failed = (data as Score[]).filter(s => (s as Score & { status?: string }).status === 'failed').length
      setFailedCount(failed)
    }
  }

  const fetchPanelResult = async () => {
    setLoadingPanel(true)
    try {
      const res = await fetch(`/api/events/${eventId}/panel-result`)
      if (res.ok) {
        const data = await res.json()
        setPanelResult(data)
      }
    } finally {
      setLoadingPanel(false)
    }
  }

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/review/${eventId}/status`, { credentials: 'include' })
        if (!res.ok) return  // network error - keep polling
        const data = await res.json()
        if (data.error) return  // api error - keep polling
        setProgress(data.progress ?? 0)
        setProgressTotal(data.total ?? 0)
        setProgressCompleted(data.completed ?? 0)
        setCurrentProject(data.currentProject ?? '')
        setCurrentModel(data.currentModel ?? '')

        if (data.done) {
          setDone(true)
          setReviewing(false)
          setProgress(100)
          if (pollRef.current) clearInterval(pollRef.current)
          toast.success('评审完成！')
          fetchScores()
        } else if ((data.total ?? 0) === 0 && (data.completed ?? 0) === 0) {
          // Queue is empty and no tasks running - reset to start state
          setReviewing(false)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch {
        // ignore poll errors
      }
    }, 2000)
  }

  const handleStartReview = async () => {
    if (!event) return

    setReviewing(true)
    setError('')
    setProgress(0)
    startPolling()

    try {
      // Use enqueue → VPS worker for large events (scalable, no Vercel timeout)
      const res = await fetch(`/api/events/${eventId}/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: localModels, sonarEnabled: localSonar, force: true }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '评审启动失败')

      toast.info(`已提交 ${data.enqueued ?? 0} 个项目到评审队列，正在处理中...`)
      setReviewing(true)
      startPolling()
      await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'judging' })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '评审失败，请重试')
      setReviewing(false)
      toast.error(err instanceof Error ? err.message : '评审失败，请重试')
    } finally {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }

  const openEditScore = (score: Score) => {
    setEditingScore(score)
    const dims: Record<string, number> = {}
    if (score.final_dimension_scores) {
      Object.assign(dims, score.final_dimension_scores)
    } else {
      Object.assign(dims, score.dimension_scores ?? {})
    }
    setEditDimValues(dims)
    setEditScoreOpen(true)
  }

  const handleSaveScore = async () => {
    if (!editingScore) return
    setSavingScore(true)
    try {
      const res = await fetch(`/api/scores/${editingScore.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_dimension_scores: editDimValues }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '保存失败')

      setScores(prev => prev.map(s =>
        s.id === editingScore.id
          ? { ...s, final_dimension_scores: editDimValues, final_overall_score: data.final_overall_score }
          : s
      ))
      toast.success('分数已更新')
      setEditScoreOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingScore(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (!event) return null

  const costPerProject = localModels.length + (localWeb3 ? 0.5 : 0)
  const totalCost = Math.ceil(projectCount * costPerProject) + (localSonar ? projectCount * 2 : 0)
  const hasEnoughCredits = credits >= totalCost
  const isPanelMode = event.mode === 'panel_review'

  // Group scores by project for ai_only mode
  const scoresByProject: Record<string, Score[]> = {}
  for (const score of scores) {
    if (!scoresByProject[score.project_id]) scoresByProject[score.project_id] = []
    scoresByProject[score.project_id].push(score)
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/events/${eventId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={14} />
          返回活动详情
        </Link>
        <h1 className="text-2xl font-bold">{isPanelMode ? '多人评审结果' : 'AI 评审'}</h1>
        <p className="text-muted-foreground text-sm mt-1">{event.name}</p>
      </div>

      {/* Panel review mode */}
      {isPanelMode && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users size={16} />
                评委完成情况
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPanel ? (
                <p className="text-sm text-muted-foreground">加载中...</p>
              ) : !panelResult ? (
                <p className="text-sm text-muted-foreground">暂无数据</p>
              ) : (
                <div className="space-y-2">
                  {panelResult.reviewer_status.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无评委，请先在活动详情页邀请评委</p>
                  ) : (
                    panelResult.reviewer_status.map(r => (
                      <div key={r.user_id} className="flex items-center justify-between p-2.5 rounded border">
                        <span className="text-sm">{r.email}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{r.scored}/{r.total}</span>
                          {r.done ? (
                            <CheckCircle2 size={14} className="text-green-500" />
                          ) : (
                            <Clock size={14} className="text-fg-subtle" />
                          )}
                          <Badge variant={r.done ? 'outline' : 'secondary'} className="text-xs">
                            {r.done ? '已完成' : '未完成'}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={fetchPanelResult}
                  >
                    刷新状态
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {panelResult && panelResult.all_done && panelResult.ranking.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy size={16} className="text-yellow-500" />
                  汇总排名
                </CardTitle>
                <CardDescription>所有评委 final_overall_score 平均值</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {panelResult.ranking.map((item, index) => (
                    <div key={item.project_id} className="flex items-center gap-3 p-2.5 rounded border">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-700' :
                        index === 1 ? 'bg-surface-2 text-fg-muted' :
                        index === 2 ? 'bg-orange-50 text-orange-600' :
                        'bg-surface text-fg-muted'
                      }`}>
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        {item.team_name && (
                          <p className="text-xs text-muted-foreground">{item.team_name}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{item.avg_score.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{item.reviewer_count} 位评委</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {panelResult && !panelResult.all_done && (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="pt-4">
                <p className="text-sm text-yellow-700">
                  评委尚未全部完成评审，汇总排名将在所有评委完成后显示
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* AI-only mode */}
      {!isPanelMode && (
        <>
          {/* Review Summary */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">评审配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">参赛项目</p>
                  <p className="font-semibold">{projectCount} 个</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">评审模型</p>
                  <p className="font-semibold">{localModels.length} 个</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">评审次数</p>
                  <p className="font-semibold">{projectCount * localModels.length} 次</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">积分消耗</p>
                  <p className={`font-semibold ${!hasEnoughCredits ? 'text-red-500' : ''}`}>
                    {totalCost} 积分
                    {!hasEnoughCredits && <span className="text-xs ml-1">（不足）</span>}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-2">评审模型</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(MODEL_CREDITS).map(model => (
                    <label key={model} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localModels.includes(model)}
                        onChange={() => setLocalModels(prev =>
                          prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]
                        )}
                        className="h-4 w-4 rounded border-token-strong"
                      />
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${MODEL_COLORS[model] || 'bg-surface-2 text-fg'}`}>
                        {MODEL_NAMES[model] || model}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-3">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Web3 洞察模式</p>
                    <p className="text-xs text-muted-foreground">链上活跃度分析（+1 积分/项目）</p>
                  </div>
                  <button type="button" role="switch" aria-checked={localWeb3}
                    onClick={async () => {
                      const next = !localWeb3
                      setLocalWeb3(next)
                      await fetch(`/api/events/${event.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ web3_enabled: next })
                      })
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${localWeb3 ? 'bg-[var(--color-fg)]' : 'bg-surface-2'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-bg transition-transform ${localWeb3 ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">SonarQube 代码质量</p>
                    <p className="text-xs text-muted-foreground">静态代码分析（+2 积分/项目）</p>
                  </div>
                  <button type="button" role="switch" aria-checked={localSonar}
                    onClick={async () => {
                      const next = !localSonar
                      setLocalSonar(next)
                      await fetch(`/api/events/${event.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sonar_enabled: next })
                      })
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${localSonar ? 'bg-[var(--color-fg)]' : 'bg-surface-2'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-bg transition-transform ${localSonar ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground mt-3">
                当前剩余积分：<span className="font-medium text-foreground">{credits}</span>
              </div>
            </CardContent>
          </Card>

          {/* Progress Card */}
          {(reviewing || done) && (
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {done ? (
                    <>
                      <CheckCircle size={16} className="text-green-600" />
                      评审完成
                    </>
                  ) : (
                    <>
                      <Loader2 size={16} className="animate-spin text-blue-500" />
                      评审进行中...
                    </>
                  )}
                </CardTitle>
                {reviewing && !done && (
                  <CardDescription>
                    AI 正在逐一评审每个项目，请耐心等待（约 {Math.ceil(projectCount * localModels.length * 8)} 秒）
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground">
                  {currentProject && (
                    <p className="text-sm text-fg-muted mb-1">
                      正在评审：<span className="font-medium">{currentProject}</span>
                      {currentModel && <span className="text-muted-foreground">（{currentModel}）</span>}
                    </p>
                  )}
                  {progressCompleted} / {progressTotal} 项评审完成（{progress}%）
                </p>

                {done && (
                  <div className="flex gap-2 pt-2 flex-col">
                    <div className="flex gap-2">
                      <Link href={`/report/${eventId}`} target="_blank" className="flex-1">
                        <Button className="w-full">查看评审报告</Button>
                      </Link>
                      <Link href={`/events/${eventId}`} className="flex-1">
                        <Button variant="outline" className="w-full">返回活动详情</Button>
                      </Link>
                    </div>
                    {failedCount > 0 && (
                      <Button
                        variant="outline"
                        className="w-full gap-2 border-orange-300 text-orange-600 hover:bg-orange-50"
                        onClick={() => {
                          setDone(false)
                          setError('')
                          handleStartReview()
                        }}
                        disabled={reviewing}
                      >
                        <AlertCircle size={14} />
                        重试失败项（{failedCount} 个失败）
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Error state */}
          {error && (
            <Card className="mb-4 border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <p className="text-sm text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  {error}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Start button */}
          {!reviewing && !done && (
            <div className="space-y-3">
              {projectCount === 0 && (
                <Card className="border-yellow-200 bg-yellow-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-yellow-700">
                      当前活动没有项目，请先导入参赛项目再开始评审
                    </p>
                  </CardContent>
                </Card>
              )}

              {!hasEnoughCredits && projectCount > 0 && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-red-600">
                      积分不足，需要 {totalCost} 积分，当前剩余 {credits} 积分
                    </p>
                  </CardContent>
                </Card>
              )}

              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handleStartReview}
                disabled={projectCount === 0 || !hasEnoughCredits || reviewing}
              >
                <Play size={16} />
                开始 AI 评审
              </Button>
            </div>
          )}

          {/* Score cards with edit option */}
          {done && scores.length > 0 && (
            <div className="mt-6 space-y-4">
              <h2 className="text-lg font-semibold">评分结果（可修改）</h2>
              {Object.entries(scoresByProject).map(([projectId, projectScores]) => {
                const projectName = projectScores[0]?.projects?.name ?? projectId
                return (
                  <Card key={projectId}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">{projectName}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {projectScores.map(score => {
                        const displayScores = score.final_dimension_scores ?? score.dimension_scores
                        const displayOverall = score.final_overall_score ?? score.overall_score
                        const isEdited = score.final_dimension_scores != null
                        return (
                          <div key={score.id} className="flex items-start justify-between gap-3 p-2 rounded border">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${MODEL_COLORS[score.model] || 'bg-surface-2 text-fg'}`}>
                                  {MODEL_NAMES[score.model] || score.model}
                                </span>
                                {isEdited && (
                                  <Badge variant="outline" className="text-xs">已修改</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                {Object.entries(displayScores ?? {}).map(([dim, val]) => (
                                  <span key={dim}>{dim}: <span className="font-medium text-foreground">{val}</span></span>
                                ))}
                              </div>
                              {score.comment && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{score.comment}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-bold">{typeof displayOverall === 'number' ? displayOverall.toFixed(2) : '—'}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openEditScore(score)}
                                title="修改分数"
                              >
                                <Pencil size={12} />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Edit Score Dialog */}
      <Dialog open={editScoreOpen} onOpenChange={setEditScoreOpen}>
        <DialogContent className="max-w-sm bg-bg text-fg">
          <DialogHeader>
            <DialogTitle>修改分数</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editingScore && event.dimensions.map(dim => (
              <div key={dim.name} className="flex items-center gap-3">
                <label className="flex-1 text-sm">{dim.name} <span className="text-xs text-muted-foreground">({dim.weight}%)</span></label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.1}
                  value={editDimValues[dim.name] ?? ''}
                  onChange={e => setEditDimValues(prev => ({ ...prev, [dim.name]: parseFloat(e.target.value) || 0 }))}
                  className="w-[70px] border rounded px-2 py-1 text-sm text-right bg-surface-2"
                />
                <span className="text-xs text-muted-foreground">/ 10</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditScoreOpen(false)} disabled={savingScore}>
              取消
            </Button>
            <Button onClick={handleSaveScore} disabled={savingScore}>
              {savingScore ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
