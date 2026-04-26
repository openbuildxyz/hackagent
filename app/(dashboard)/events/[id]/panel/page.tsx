'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useT } from '@/lib/i18n'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ArrowLeft, Trophy, Users, CheckCircle2, Clock, RefreshCw } from 'lucide-react'

type ReviewerStatus = {
  user_id: string
  email: string
  name?: string | null
  scored: number
  total: number
  done: boolean
}

type Track = {
  id: string
  name: string
  description?: string
  prize?: string
}

type PanelRankEntry = {
  project_id: string
  name: string
  team_name: string | null
  track_ids?: string[]
  avg_score: number
  reviewer_count: number
}

type ReviewerDetailEntry = {
  project_id: string
  name: string
  team_name: string | null
  final_overall_score: number | null
  final_dimension_scores: Record<string, number> | null
}

type PanelResult = {
  reviewer_count: number
  project_count: number
  all_done: boolean
  reviewer_status: ReviewerStatus[]
  ranking: PanelRankEntry[]
  reviewer_details: Record<string, ReviewerDetailEntry[]>
  tracks?: Track[]
}

export default function PanelPage() {
  const params = useParams()
  const eventId = params.id as string
  const t = useT()
  const [result, setResult] = useState<PanelResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedReviewer, setSelectedReviewer] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<string>('all')

  const fetchResult = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/events/${eventId}/panel-result`)
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || '获取数据失败')
      }
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResult()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const selectedReviewerInfo = result?.reviewer_status.find(r => r.user_id === selectedReviewer)
  const selectedReviewerLabel = selectedReviewerInfo
    ? (selectedReviewerInfo.name ? selectedReviewerInfo.name : selectedReviewerInfo.email)
    : ''
  const selectedDetails = selectedReviewer ? (result?.reviewer_details?.[selectedReviewer] ?? []) : []

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('panel.title')}</h1>
            <p className="text-muted-foreground text-sm mt-1">{t('panel.subtitle')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchResult} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {t('panel.refresh')}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading && !result && (
        <p className="text-muted-foreground text-sm">加载中...</p>
      )}

      {result && (() => {
        const tracks = result.tracks ?? []
        const filteredRanking = selectedTrack === 'all'
          ? result.ranking
          : result.ranking.filter(r => r.track_ids?.includes(selectedTrack))
        return (
        <div className="space-y-4">
          {/* Track tabs */}
          {tracks.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setSelectedTrack('all')}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${selectedTrack === 'all' ? 'bg-[var(--color-fg)] text-white border-[var(--color-fg)]' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
              >{t('track.all')}</button>
              {tracks.map(tr => (
                <button
                  key={tr.id}
                  onClick={() => setSelectedTrack(tr.id)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${selectedTrack === tr.id ? 'bg-purple-600 text-white border-purple-600' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
                >
                  {tr.name}
                  {tr.prize && <span className="ml-1.5 text-xs opacity-70">🏆 {tr.prize}</span>}
                </button>
              ))}
            </div>
          )}
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold">{result.reviewer_count}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('panel.reviewerCount')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold">{result.project_count}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('panel.projectCount')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-2xl font-bold">{result.reviewer_status.filter(r => r.done).length}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('panel.completedReviewers')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Reviewer Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users size={16} />
                {t('panel.completionStatus')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.reviewer_status.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('panel.noReviewers')}</p>
              ) : (
                <div className="space-y-2">
                  {result.reviewer_status.map(r => (
                    <div
                      key={r.user_id}
                      className="flex items-center justify-between p-2.5 rounded border cursor-pointer hover:bg-[var(--color-surface)]"
                      onClick={() => setSelectedReviewer(r.user_id)}
                    >
                      <div className="flex flex-col min-w-0">
                        {r.name ? (
                          <>
                            <span className="text-sm">{r.name}</span>
                            <span className="text-xs text-muted-foreground">{r.email}</span>
                          </>
                        ) : (
                          <span className="text-sm">{r.email}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{r.scored}/{r.total}</span>
                        {r.done ? (
                          <CheckCircle2 size={14} className="text-green-500" />
                        ) : (
                          <Clock size={14} className="text-fg-subtle" />
                        )}
                        <Badge variant={r.done ? 'outline' : 'secondary'} className="text-xs">
                          {r.done ? t('panel.done') : t('panel.inProgress')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ranking */}
          {filteredRanking.length > 0 ? (
            <div className="rounded-2xl overflow-hidden bg-[#0d1117] border border-[#21262d]">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#21262d]">
                <div className="flex items-center gap-2 text-[#8b949e] text-xs font-mono">
                  <span className="text-[#58a6ff]">{'//'}</span>
                  {t('panel.ranking')}
                  {selectedTrack !== 'all' && tracks.find(tr => tr.id === selectedTrack)?.name && (
                    <span className="text-purple-400">— {tracks.find(tr => tr.id === selectedTrack)?.name}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-emerald-400 font-semibold tracking-widest">LIVE</span>
                </div>
              </div>
              {/* Rows */}
              <div className="divide-y divide-[#21262d]">
                {filteredRanking.map((item, index) => {
                  const maxScore = filteredRanking[0]?.avg_score || 100
                  const pct = maxScore > 0 ? (item.avg_score / maxScore) * 100 : 0
                  const barColor = index === 0 ? '#7c3aed' : index === 1 ? '#2563eb' : index === 2 ? '#d97706' : '#374151'
                  const scoreInt = Math.round(item.avg_score)
                  return (
                    <div key={item.project_id} className="flex items-center gap-4 px-5 py-3">
                      <span className={`text-xs font-bold w-5 text-right ${
                        index === 0 ? 'text-yellow-400' :
                        index === 1 ? 'text-[#8b949e]' :
                        index === 2 ? 'text-orange-400' : 'text-[#484f58]'
                      }`}>#{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#e6edf3] truncate">{item.name}</p>
                        <div className="mt-1 h-1 rounded-full bg-[#21262d] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: barColor }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-[#8b949e]">
                          {item.reviewer_count} {t('panel.reviewerSuffix')}
                        </span>
                        <span className={`text-xl font-black tabular-nums ${
                          index === 0 ? 'text-yellow-400' :
                          index === 1 ? 'text-[#79c0ff]' :
                          'text-[#e6edf3]'
                        }`}>{scoreInt}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Footer */}
              <div className="px-5 py-2 border-t border-[#21262d] flex items-center justify-between">
                <span className="text-[11px] text-[#484f58]">
                  {filteredRanking.length} {t('panel.rankingDesc')}
                </span>
              </div>
            </div>
          ) : (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="pt-4">
                <p className="text-sm text-yellow-700">
                  {result.reviewer_status.length === 0
                    ? t('panel.inviteFirst')
                    : t('panel.noScores')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        )
      })()}

      {/* Reviewer Detail Sheet */}
      <Sheet open={selectedReviewer !== null} onOpenChange={open => { if (!open) setSelectedReviewer(null) }}>
        <SheetContent className="max-w-lg w-full overflow-y-auto bg-bg">
          <SheetHeader className="mb-4">
            <SheetTitle className="truncate text-base">{selectedReviewerLabel}</SheetTitle>
          </SheetHeader>
          {selectedDetails.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('panel.noScores')}</p>
          ) : (
            <div className="space-y-2">
              {selectedDetails.map((entry, index) => {
                const hasScore = typeof entry.final_overall_score === 'number' && entry.final_overall_score > 0
                const dimEntries = entry.final_dimension_scores
                  ? Object.entries(entry.final_dimension_scores)
                  : []
                return (
                  <div key={entry.project_id} className="p-3 rounded border bg-bg">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        index === 0 ? 'bg-yellow-100 text-yellow-700' :
                        index === 1 ? 'bg-surface-2 text-fg-muted' :
                        index === 2 ? 'bg-orange-50 text-orange-600' :
                        'bg-surface text-fg-muted'
                      }`}>
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.name}</p>
                        {entry.team_name && (
                          <p className="text-xs text-muted-foreground">{entry.team_name}</p>
                        )}
                      </div>
                      <span className={`text-lg font-bold flex-shrink-0 ${hasScore ? 'text-indigo-600' : 'text-muted-foreground'}`}>
                        {hasScore ? entry.final_overall_score!.toFixed(2) : t('panel.notSubmitted')}
                      </span>
                    </div>
                    {hasScore && dimEntries.length > 0 && (
                      <div className="mt-2 ml-7 space-y-1">
                        {dimEntries.map(([dim, score]) => (
                          <div key={dim} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-24 truncate flex-shrink-0">{dim}</span>
                            <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-400 rounded-full" style={{width: `${Math.min((score/10)*100, 100)}%`}} />
                            </div>
                            <span className="text-xs font-medium text-fg-muted w-6 text-right">{score}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
