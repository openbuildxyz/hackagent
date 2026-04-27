'use client'

import { useState, useCallback } from 'react'
import { useEffect } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { Sun, Moon } from 'lucide-react'
import { useT, useLocale } from '@/lib/i18n'
import { formatDateLong } from '@/lib/format-date'
import PublicNavbar from '@/components/PublicNavbar'
import EventCover from '@/components/EventCover'

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
        <div className="overflow-y-auto px-6 py-4 prose prose-sm prose-gray max-w-none">
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
      className={`bg-bg rounded-xl border-2 transition-all shadow-sm hover:shadow-md flex flex-col ${
        voted ? 'border-purple-400' : 'border-token'
      }`}
    >
      <div className="p-5 flex-1">
        <div className="mb-3">
          <h3 className="text-lg font-bold leading-tight">{project.name}</h3>
          {project.team_name && (
            <p className="text-sm text-fg-muted mt-0.5">{project.team_name}</p>
          )}
        </div>

        {desc && (
          <div className="mb-3">
            <p className="text-sm text-fg-muted leading-relaxed">{preview}</p>
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
          <div className="flex flex-wrap gap-1.5 mb-3">
            {project.tags.map((tag) => (
              <span key={tag} className="text-xs bg-surface-2 text-fg-muted rounded-full px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {project.demo_url && (
            <a
              href={project.demo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2.5 py-1 hover:bg-blue-100 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Demo
            </a>
          )}
          {project.github_url && (
            <a
              href={project.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs bg-surface text-fg-muted border border-token rounded px-2.5 py-1 hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
              </svg>
              GitHub
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
  tracks = [],
}: Props) {
  const t = useT()
  const [locale] = useLocale()
  const [myVotes, setMyVotes] = useState<string[]>(initialMyVotes)
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>(initialVoteCounts)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState<string>('all')
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
  const filteredProjects = selectedTrack === 'all'
    ? initialProjects
    : initialProjects.filter(p => p.track_ids?.includes(selectedTrack))

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
              className="bg-orange-100 border border-orange-300 text-orange-800 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-300 rounded-lg px-4 py-3 mb-4 text-sm font-medium flex items-center gap-2"
              role="status"
              aria-live="polite"
            >
              <span aria-hidden>⏰</span>
              <span>
                {initialEvent.ends_at
                  ? t('vote.closed.bannerWithDate').replace('{date}', endedDateLabel)
                  : t('vote.closed.banner')}
              </span>
            </div>
          )}
          {initialEvent.banner_url && (
            <EventCover src={initialEvent.banner_url} className="rounded-xl mb-4" />
          )}
          <h1 className="text-3xl font-bold text-fg">{initialEvent.title}</h1>
          {initialEvent.vote_config_description && (
            <div className="text-fg-muted mt-3 max-w-2xl prose prose-sm prose-gray leading-relaxed">
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
        {/* Track filter */}
        {tracks.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <button
              onClick={() => setSelectedTrack('all')}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${selectedTrack === 'all' ? 'bg-[var(--color-fg)] text-white border-[var(--color-fg)]' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
            >
              {t('vote.allTracks')}
            </button>
            {tracks.map(tr => (
              <button
                key={tr.id}
                onClick={() => setSelectedTrack(tr.id)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${selectedTrack === tr.id ? 'bg-purple-600 text-white border-purple-600' : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'}`}
              >
                {tr.name}
                {tr.prize && <span className="ml-1.5 text-xs opacity-70">{tr.prize}</span>}
              </button>
            ))}
          </div>
        )}
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
