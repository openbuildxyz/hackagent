'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, ExternalLink, Trophy, Vote } from 'lucide-react'
import { useT, useLocale } from '@/lib/i18n'
import { formatDate as formatDeterministic, formatDateLong } from '@/lib/format-date'
import PublicNavbar from '@/components/PublicNavbar'
import EventStatusStepper from '@/components/EventStatusStepper'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

type Track = {
  id: string
  name: string
  description?: string
  prize?: string
}

type PublicVote = {
  enabled?: boolean
  title?: string
  description?: string
  vote_limit?: number
  ends_at?: string
  show_realtime_count?: boolean
}

export type EventDetail = {
  id: string
  name: string
  description?: string
  banner_url?: string
  status: string
  registration_config?: { open?: boolean }
  tracks?: Track[]
  registration_deadline?: string
  submission_deadline?: string
  result_announced_at?: string
  public_vote?: PublicVote | null
  cancelled_reason?: string | null
}

type PublicProject = {
  id: string
  name: string
  description: string | null
  team_name: string | null
  tags: string[] | null
  track_ids: string[] | null
  github_url: string | null
  demo_url: string | null
  logo_url: string | null
  analysis_status: string | null
  score: number
  score_count: number
}

function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkBreaks, remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, {
          ...defaultSchema,
          attributes: {
            ...defaultSchema.attributes,
            '*': (defaultSchema.attributes?.['*'] ?? []).filter((a: unknown) => a !== 'style' && a !== 'color'),
            font: [],
            span: (defaultSchema.attributes?.['span'] ?? []).filter((a: unknown) => a !== 'style' && a !== 'color'),
          },
        }]]}
      >{text}</ReactMarkdown>
    </div>
  )
}

export default function EventDetailClient({ event }: { event: EventDetail }) {
  const t = useT()
  const [locale] = useLocale()
  const [projects, setProjects] = useState<PublicProject[] | null>(null)
  const [projectsTotal, setProjectsTotal] = useState<number>(0)
  const [rankings, setRankings] = useState<PublicProject[] | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [registered, setRegistered] = useState(false)

  function statusInfo(status: string) {
    switch (status) {
      case 'recruiting': return { text: t('pub.status.recruiting'), color: 'bg-green-500/15 text-green-600 dark:text-green-400' }
      case 'done': return { text: t('pub.status.done'), color: 'bg-surface-2 text-fg-muted' }
      case 'hacking': return { text: t('pub.status.hacking'), color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' }
      case 'judging': return { text: t('pub.status.judging'), color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' }
      default: return { text: status, color: 'bg-surface-2 text-fg-muted' }
    }
  }

  function formatDate(dateStr: string) {
    return formatDateLong(dateStr, locale)
  }

  function formatDateTime(dateStr: string) {
    return formatDeterministic(dateStr, locale)
  }

  const isRegPhase = event.status === 'recruiting' || event.status === 'hacking'
  const regDeadlinePassed = !!event.registration_deadline && new Date(event.registration_deadline) < new Date()
  const isRegOpen = !!event.registration_config?.open && isRegPhase && !regDeadlinePassed
  const isDone = event.status === 'done'
  const isJudging = event.status === 'judging'
  const isHacking = event.status === 'hacking'
  const isRecruiting = event.status === 'recruiting'
  const showProjects = isDone || isJudging
  const voteConfig = event.public_vote ?? undefined
  const voteEnabled = !!voteConfig?.enabled
  const voteResultsVisible = voteEnabled && voteConfig?.show_realtime_count

  const { text: statusText, color: statusColor } = statusInfo(event.status)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch(`/api/public/events/${event.id}/projects?limit=6&sort=-score`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setProjects(data.projects ?? [])
        setProjectsTotal(data.total ?? 0)
      } catch { /* silent */ }
    }
    run()
    return () => { cancelled = true }
  }, [event.id])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const meRes = await fetch('/api/auth/me')
        if (!meRes.ok) {
          if (!cancelled) setAuthChecked(true)
          return
        }
        const me = await meRes.json()
        if (cancelled) return
        const isLoggedIn = !!me?.loggedIn
        setLoggedIn(isLoggedIn)
        if (isLoggedIn) {
          const regRes = await fetch(`/api/events/${event.id}/my-registration`)
          if (!cancelled) setRegistered(regRes.ok)
        }
      } catch { /* silent */ }
      finally {
        if (!cancelled) setAuthChecked(true)
      }
    }
    run()
    return () => { cancelled = true }
  }, [event.id])

  useEffect(() => {
    if (!isDone) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch(`/api/public/events/${event.id}/projects?limit=10&sort=-score`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const ranked = (data.projects as PublicProject[] ?? []).filter((p) => p.score > 0)
        setRankings(ranked)
      } catch { /* silent */ }
    }
    run()
    return () => { cancelled = true }
  }, [event.id, isDone])

  return (
    <div className="min-h-screen bg-bg">
      <PublicNavbar />

      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/events/public" className="inline-flex items-center gap-1.5 text-sm text-fg-subtle hover:text-[var(--color-fg)] transition-colors mb-8">
          {t('pub.detail.backToAll')}
        </Link>

        {/* Hero */}
        {event.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.banner_url}
            alt={event.name}
            className="w-full h-56 md:h-72 object-cover rounded-2xl mb-8"
          />
        ) : (
          <div className="w-full h-48 md:h-64 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center mb-8">
            <span className="text-6xl">🦞</span>
          </div>
        )}

        <div className="flex flex-wrap items-start gap-3 mb-4">
          <h1 className="text-3xl font-bold text-fg leading-tight flex-1">{event.name}</h1>
          <span className={`shrink-0 text-sm px-3 py-1 rounded-full font-medium ${statusColor}`}>{statusText}</span>
        </div>

        {event.status === 'cancelled' && (
          <div
            className="mb-6 rounded-md px-4 py-3 text-sm font-medium"
            style={{
              background: 'color-mix(in oklab, var(--color-danger) 10%, var(--color-bg))',
              borderLeft: '3px solid var(--color-danger)',
              color: 'var(--color-fg)',
            }}
          >
            此活动已取消{event.cancelled_reason ? `：${event.cancelled_reason}` : ''}
          </div>
        )}

        {event.status !== 'draft' && (
          <EventStatusStepper status={event.status} className="mb-8" />
        )}

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            {event.description && (
              <RichText
                text={event.description}
                className="prose prose-sm dark:prose-invert prose-p:text-fg prose-li:text-fg prose-headings:text-fg prose-strong:text-fg max-w-none mb-8"
              />
            )}

            {event.tracks && event.tracks.length > 0 && (
              <div className="mb-8">
                <h2 className="text-base font-semibold text-fg mb-3">{t('pub.detail.tracks')}</h2>
                <div className="flex flex-col gap-3">
                  {event.tracks.map(track => (
                    <div key={track.id} className="rounded-xl border border-token p-4">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant="secondary" className="text-sm font-medium">{track.name}</Badge>
                        {track.prize && (
                          <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{track.prize}</span>
                        )}
                      </div>
                      {track.description && (
                        <p className="text-sm text-fg-muted leading-relaxed mt-1">{track.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Public Vote section */}
            {voteEnabled && (
              <div className="mb-8 rounded-xl border border-token p-5 bg-surface-1">
                <div className="flex items-center gap-2 mb-3">
                  <Vote size={16} className="text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-base font-semibold text-fg">{voteConfig?.title || t('pub.detail.publicVote')}</h2>
                </div>
                {voteConfig?.description && (
                  <RichText
                    text={voteConfig.description}
                    className="prose prose-sm dark:prose-invert prose-p:text-fg prose-li:text-fg prose-headings:text-fg prose-strong:text-fg max-w-none mb-4"
                  />
                )}
                <div className="flex flex-wrap gap-2 mb-4">
                  {typeof voteConfig?.vote_limit === 'number' && (
                    <Badge variant="secondary" className="text-xs">
                      {t('pub.detail.voteLimit').replace('{n}', String(voteConfig.vote_limit))}
                    </Badge>
                  )}
                  {voteConfig?.ends_at && (
                    <Badge variant="secondary" className="text-xs">
                      {t('pub.detail.votesEndAt')}: {formatDateTime(voteConfig.ends_at)}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {t('pub.detail.showRealtime')}: {voteConfig?.show_realtime_count ? t('pub.detail.realtimeOn') : t('pub.detail.realtimeOff')}
                  </Badge>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {!isDone && (
                    <Link href={`/vote/${event.id}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" className="gap-1.5">
                        <Vote size={14} />
                        {t('pub.detail.openVoting')}
                      </Button>
                    </Link>
                  )}
                  {isDone && voteResultsVisible && (
                    <Link href={`/vote/${event.id}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <ExternalLink size={14} />
                        {t('pub.detail.viewVoteResults')}
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Projects showcase — only after submissions are sealed (judging/done) */}
            {showProjects && projects && projects.length > 0 && (
              <div className="mb-8">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h2 className="text-base font-semibold text-fg">{t('pub.detail.projects')}</h2>
                  <p className="text-xs text-fg-subtle">
                    {t('pub.detail.projectsCount').replace('{n}', String(projectsTotal))}
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/report/${event.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-token p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-fg line-clamp-1 flex-1">{p.name}</h3>
                        {isDone && p.score > 0 && (
                          <span className="shrink-0 text-xs font-bold tabular-nums px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                            {p.score.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {p.team_name && (
                        <p className="text-xs text-fg-subtle mb-2">{p.team_name}</p>
                      )}
                      {p.description && (
                        <p className="text-xs text-fg-muted line-clamp-2 leading-relaxed">
                          {p.description.replace(/[#*`>\-\[\]]/g, '').slice(0, 160)}
                        </p>
                      )}
                      {p.tags && p.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.tags.slice(0, 3).filter((tg) => !/^https?:/.test(tg)).map((tg) => (
                            <span key={tg} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-subtle">{tg}</span>
                          ))}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Final Rankings */}
            {isDone && rankings && rankings.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy size={16} className="text-amber-500" />
                  <h2 className="text-base font-semibold text-fg">{t('pub.detail.rankings')}</h2>
                </div>
                <p className="text-xs text-fg-subtle mb-3">{t('pub.detail.rankingsDesc')}</p>
                <div className="rounded-xl border border-token overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-xs text-fg-subtle">
                      <tr>
                        <th className="text-left px-3 py-2 w-10">{t('pub.detail.rankColRank')}</th>
                        <th className="text-left px-3 py-2">{t('pub.detail.rankColProject')}</th>
                        <th className="text-left px-3 py-2 hidden sm:table-cell">{t('pub.detail.rankColTeam')}</th>
                        <th className="text-right px-3 py-2 w-20">{t('pub.detail.rankColScore')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankings.map((p, i) => {
                        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                        return (
                          <tr key={p.id} className="border-t border-token hover:bg-surface-1">
                            <td className="px-3 py-2 tabular-nums text-fg-muted">
                              {medal ?? i + 1}
                            </td>
                            <td className="px-3 py-2 text-fg font-medium truncate max-w-[240px]">{p.name}</td>
                            <td className="px-3 py-2 text-fg-subtle hidden sm:table-cell truncate max-w-[140px]">{p.team_name || '—'}</td>
                            <td className="px-3 py-2 text-right font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                              {p.score > 0 ? p.score.toFixed(1) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-right">
                  <Link href={`/report/${event.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                    {t('pub.detail.viewFullReport')}
                  </Link>
                </div>
              </div>
            )}

            {isDone && rankings && rankings.length === 0 && projects && projects.length === 0 && (
              <div className="mb-8 rounded-xl border border-dashed border-token p-6 text-center">
                <p className="text-sm text-fg-subtle">{t('pub.detail.noProjects')}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {(event.registration_deadline || event.submission_deadline || event.result_announced_at) && (
              <div className="rounded-xl border border-token p-5">
                <div className="flex flex-col gap-3">
                  {event.registration_deadline && (
                    <div className="flex items-start gap-2.5">
                      <Calendar size={15} className="text-fg-subtle mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-fg-subtle mb-0.5">{t('pub.detail.regDeadline')}</p>
                        <p className="text-sm font-medium text-fg">{formatDate(event.registration_deadline)}</p>
                      </div>
                    </div>
                  )}
                  {event.submission_deadline && (
                    <div className="flex items-start gap-2.5">
                      <Calendar size={15} className="text-fg-subtle mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-fg-subtle mb-0.5">{t('pub.detail.subDeadline')}</p>
                        <p className="text-sm font-medium text-fg">{formatDate(event.submission_deadline)}</p>
                      </div>
                    </div>
                  )}
                  {event.result_announced_at && (
                    <div className="flex items-start gap-2.5">
                      <Calendar size={15} className="text-fg-subtle mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-fg-subtle mb-0.5">{t('pub.detail.resultDate')}</p>
                        <p className="text-sm font-medium text-fg">{formatDate(event.result_announced_at)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {event.status !== 'draft' && authChecked && (
                <>
                  {registered ? (
                    <Link href="/events">
                      <Button variant="outline" className="w-full">{t('pub.detail.alreadyRegistered')}</Button>
                    </Link>
                  ) : isRecruiting && isRegOpen ? (
                    loggedIn ? (
                      <Link href={`/apply/${event.id}`}>
                        <Button className="w-full">{t('pub.apply')}</Button>
                      </Link>
                    ) : (
                      <Link href={`/login?redirect=${encodeURIComponent(`/apply/${event.id}`)}`}>
                        <Button className="w-full">{t('pub.detail.signInToApply')}</Button>
                      </Link>
                    )
                  ) : isRecruiting ? (
                    <div className="rounded-lg border border-token bg-surface-1 px-4 py-3 text-sm text-fg-muted text-center">
                      {regDeadlinePassed
                        ? t('pub.detail.regDeadlinePassed')
                        : t('pub.detail.regClosed')}
                    </div>
                  ) : isHacking ? (
                    <Button className="w-full" disabled>{t('pub.detail.registrationClosed')}</Button>
                  ) : isJudging ? (
                    <Button className="w-full" disabled>{t('pub.detail.underReview')}</Button>
                  ) : isDone ? (
                    <Button className="w-full" disabled>{t('pub.detail.eventEnded')}</Button>
                  ) : null}
                </>
              )}
              {voteEnabled && !isDone && (
                <Link href={`/vote/${event.id}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full gap-1.5">
                    <ExternalLink size={14} />
                    {t('pub.vote')}
                  </Button>
                </Link>
              )}
              {isDone && (
                <Link href={`/report/${event.id}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full gap-1.5">
                    <Trophy size={14} />
                    {t('pub.detail.viewAiReport')}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
