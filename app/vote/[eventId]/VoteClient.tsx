'use client'

import { useState, useCallback } from 'react'
import { useEffect } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { ExternalLink, Github, Search } from 'lucide-react'
import { useT, useLocale } from '@/lib/i18n'
import { formatDateLong } from '@/lib/format-date'
import PublicNavbar from '@/components/PublicNavbar'

type Track = {
  id: string
  name: string
  description?: string
  prize?: string
}

type Project = {
  id: string
  name: string
  team_name: string | null
  description?: string
  demo_url?: string
  github_url?: string
  tags?: string[]
  track_ids?: string[]
}

type EventInfo = {
  id: string
  name: string
  description: string | null
  title: string
  vote_config_description: string
  vote_limit: number
  ends_at: string | null
  show_realtime_count: boolean
  show_ai_score: boolean
  banner_url?: string | null
}

type Props = {
  eventId: string
  userId: string | null
  initialEvent: EventInfo
  initialProjects: Project[]
  initialVoteCounts: Record<string, number>
  initialMyVotes: string[]
  tracks?: Track[]
}

function useCountdown(endsAt: string | null) {
  const t = useT()
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!endsAt) return
    function update() {
      const diff = new Date(endsAt!).getTime() - Date.now()
      if (diff <= 0) { setLabel(t('vote.expired')); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      if (d > 0) setLabel(t('vote.remainingDH').replace('{d}', String(d)).replace('{h}', String(h)))
      else if (h > 0) setLabel(t('vote.remainingHM').replace('{h}', String(h)).replace('{m}', String(m)))
      else setLabel(t('vote.remainingMS').replace('{m}', String(m)).replace('{s}', String(s)))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [endsAt, t])
  return label
}

function DescriptionModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const t = useT()
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative bg-bg rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-token shrink-0">
          <h2 className="text-lg font-bold text-fg">{project.name}</h2>
          <button
            onClick={onClose}
            className="text-fg-subtle hover:text-[var(--color-fg-muted)] transition-colors text-xl leading-none"
            aria-label={t('vote.close')}
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 prose prose-sm dark:prose-invert prose-a:break-all prose-code:break-all prose-pre:whitespace-pre-wrap prose-pre:break-words max-w-none break-words [overflow-wrap:anywhere]">
          <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>
            {project.description ?? ''}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

function ProjectCard({
  project,
  voted,
  voteCount,
  showCount,
  canVote,
  onVote,
  onUnvote,
  loading,
}: {
  project: Project
  voted: boolean
  voteCount: number
  showCount: boolean
  canVote: boolean
  onVote: () => void
  onUnvote: () => void
  loading: boolean
}) {
  const t = useT()
  const [modalOpen, setModalOpen] = useState(false)
  const desc = project.description ?? ''
  const plainDesc = desc
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^>\s*/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.+?)\]\(.*?\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[-_]{3,}/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  const preview = plainDesc.length > 100 ? plainDesc.slice(0, 100) + '...' : plainDesc

  return (
    <>
      {modalOpen && <DescriptionModal project={project} onClose={() => setModalOpen(false)} />}
    <div
      className={`bg-bg rounded-xl border-2 transition-all shadow-sm hover:shadow-md flex min-w-0 flex-col ${
        voted ? 'border-purple-400' : 'border-token'
      }`}
    >
      <div className="min-w-0 p-5 flex-1">
        <div className="mb-3 min-w-0">
          <h3 className="text-lg font-bold leading-tight break-words">{project.name}</h3>
          {project.team_name && (
            <p className="text-sm text-fg-muted mt-0.5 break-words">{project.team_name}</p>
          )}
        </div>

        {desc && (
          <div className="mb-3 min-w-0">
            <p className="text-sm text-fg-muted leading-relaxed break-words [overflow-wrap:anywhere]">{preview}</p>
            {desc.length > 100 && (
              <button
                onClick={() => setModalOpen(true)}
                className="text-xs text-purple-600 mt-1 hover:underline"
              >
                {t('vote.expand')}
              </button>
            )}
          </div>
        )}

        {project.tags && project.tags.length > 0 && (
          <div className="mb-3 flex min-w-0 flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <span key={tag} title={tag} className="max-w-full rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted break-all [overflow-wrap:anywhere]">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex min-w-0 flex-wrap gap-2">
          {project.demo_url && (
            <a
              href={project.demo_url}
              target="_blank"
              rel="noopener noreferrer"
              title={project.demo_url}
              aria-label={`Open demo for ${project.name}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200 dark:hover:bg-blue-400/20"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Demo</span>
            </a>
          )}
          {project.github_url && (
            <a
              href={project.github_url}
              target="_blank"
              rel="noopener noreferrer"
              title={project.github_url}
              aria-label={`Open GitHub repository for ${project.name}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-token bg-surface px-3 text-xs font-semibold text-fg-muted transition-colors hover:bg-[var(--color-surface-2)] hover:text-fg"
            >
              <Github className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>GitHub</span>
            </a>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-token flex items-center justify-between gap-3">
        {showCount && (
          <span className="text-sm text-fg-muted">
            <span className="font-semibold text-fg">{voteCount}</span> {t('vote.tickets')}
          </span>
        )}
        {!showCount && <div />}
        <button
          disabled={loading || (!voted && !canVote)}
          onClick={voted ? onUnvote : onVote}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            voted
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : canVote
              ? 'bg-surface-2 text-fg hover:bg-purple-50 hover:text-purple-700 border border-token'
              : 'bg-surface-2 text-fg-subtle border border-token'
          }`}
        >
          {voted ? (
            <>
              <span>✓</span> {t('vote.voted')}
            </>
          ) : (
            <>
              <span>♡</span> {t('vote.action.vote')}
            </>
          )}
        </button>
      </div>
    </div>
    </>
  )
}

export default function VoteClient({
  eventId,
  userId,
  initialEvent,
  initialProjects,
  initialVoteCounts,
  initialMyVotes,
}: Props) {
  const t = useT()
  const [locale] = useLocale()
  const [myVotes, setMyVotes] = useState<string[]>(initialMyVotes)
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>(initialVoteCounts)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    if (next) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
  }
  const countdown = useCountdown(initialEvent.ends_at)
  const voteLimit = initialEvent.vote_limit
  const remaining = voteLimit - myVotes.length
  const isEnded = initialEvent.ends_at ? new Date(initialEvent.ends_at) < new Date() : false

  const handleVote = useCallback(async (projectId: string) => {
    if (!userId) {
      window.location.href = `/login?redirect=/vote/${eventId}`
      return
    }
    setLoadingId(projectId)
    try {
      const res = await fetch(`/api/vote/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const data = await res.json()
      if (!res.ok) return
      setMyVotes(data.my_votes)
      setVoteCounts((prev) => ({ ...prev, [projectId]: (prev[projectId] ?? 0) + 1 }))
      if (data.votes_remaining === 0) {
        setDone(true)
      }
    } finally {
      setLoadingId(null)
    }
  }, [eventId])

  const handleUnvote = useCallback(async (projectId: string) => {
    setLoadingId(projectId)
    try {
      const res = await fetch(`/api/vote/${eventId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const data = await res.json()
      if (!res.ok) return
      setMyVotes(data.my_votes)
      setVoteCounts((prev) => ({ ...prev, [projectId]: Math.max(0, (prev[projectId] ?? 1) - 1) }))
      setDone(false)
    } finally {
      setLoadingId(null)
    }
  }, [eventId])

  const progressPct = voteLimit > 0 ? (myVotes.length / voteLimit) * 100 : 0
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredProjects = normalizedSearch
    ? initialProjects.filter((p) => p.name.toLowerCase().includes(normalizedSearch))
    : initialProjects

  const endedDateLabel = initialEvent.ends_at
    ? formatDateLong(initialEvent.ends_at, locale)
    : ''

  return (
    <div className="min-h-screen bg-surface">
      <PublicNavbar />

      {/* Header */}
      <div className="bg-bg border-b border-token shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {isEnded && (
            <div
              className="rounded-xl border border-amber-500/45 bg-amber-50 px-4 py-3 mb-4 text-sm font-semibold text-amber-950 shadow-sm ring-1 ring-amber-500/10 dark:bg-amber-950/35 dark:border-amber-400/35 dark:text-amber-100 flex items-center gap-2"
              role="status"
              aria-live="polite"
            >
              <span aria-hidden className="shrink-0 text-base">⏰</span>
              <span className="leading-relaxed">
                {initialEvent.ends_at
                  ? t('vote.closed.bannerWithDate').replace('{date}', endedDateLabel)
                  : t('vote.closed.banner')}
              </span>
            </div>
          )}
          {initialEvent.banner_url && (
            <div className="mb-4 overflow-hidden rounded-xl border border-token bg-black shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={initialEvent.banner_url}
                alt={initialEvent.title}
                className="mx-auto block h-auto max-h-none w-full object-contain md:max-h-[520px] md:w-auto md:max-w-full"
              />
            </div>
          )}
          <h1 className="text-2xl md:text-3xl font-bold text-fg">{initialEvent.title}</h1>
          {initialEvent.vote_config_description && (
            <div className="mt-3 max-w-3xl rounded-xl border border-token bg-surface-2/80 px-4 py-3 text-fg shadow-sm dark:bg-white/[0.06] dark:text-zinc-100 dark:border-white/15 prose prose-sm dark:prose-invert prose-p:text-current prose-li:text-current prose-strong:text-current prose-ul:my-1 prose-li:my-0.5 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>{initialEvent.vote_config_description}</ReactMarkdown>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {initialEvent.ends_at && (
              <span className={`text-sm font-medium ${isEnded ? 'text-red-600' : 'text-orange-600'}`}>
                {isEnded ? t('vote.ended') : countdown}
              </span>
            )}
          </div>

          {/* Vote progress — hidden once voting is closed */}
          {!isEnded && (
            <div className="mt-5 max-w-sm">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-fg-muted font-medium">
                  {t('vote.youHave').replace('{n}', String(remaining))}
                </span>
                <span className="text-fg-subtle">{t('vote.totalLimit').replace('{n}', String(voteLimit))}</span>
              </div>
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Projects grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="relative mb-6 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-fg-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('vote.searchPlaceholder')}
            aria-label={t('vote.searchPlaceholder')}
            className="w-full rounded-full border border-token bg-bg py-2.5 pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
          />
        </div>
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16 text-fg-subtle">{t('vote.noProjects')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                voted={myVotes.includes(project.id)}
                voteCount={voteCounts[project.id] ?? 0}
                showCount={initialEvent.show_realtime_count}
                canVote={!isEnded && remaining > 0}
                onVote={() => handleVote(project.id)}
                onUnvote={() => handleUnvote(project.id)}
                loading={loadingId === project.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Done banner */}
      {done && (
        <div className="fixed bottom-0 inset-x-0 bg-purple-700 text-white text-center py-4 text-base font-medium shadow-lg">
          {t('vote.completeBanner')}
        </div>
      )}

      <footer className="bg-bg border-t border-token mt-16">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-fg-subtle">
          <span>© 2026 HackAgent · Powered by OpenBuild</span>
          <Link href="/" className="hover:text-[var(--color-fg-muted)] transition-colors">{t('vote.backHome')}</Link>
        </div>
      </footer>
    </div>
  )
}
