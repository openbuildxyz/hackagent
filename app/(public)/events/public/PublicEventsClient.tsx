'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Calendar, Trophy, Tag, Zap, Search, Vote } from 'lucide-react'
import { useT, useLocale, type TranslationKey } from '@/lib/i18n'
import { formatMonthDay } from '@/lib/format-date'
import PublicNavbar from '@/components/PublicNavbar'
import EventCover from '@/components/EventCover'

function descriptionSnippet(html: string | undefined): string {
  if (!html) return ''
  // Strip HTML tags with a simple regex — no jsdom (isomorphic-dompurify pulls jsdom
  // into the server chunk and crashes SSR with ERR_REQUIRE_ESM).
  // This is a lossy text snippet for card display only — not used in any innerHTML
  // context, so regex-level stripping is sufficient and safe.
  const noHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
  // Then strip common markdown syntax so raw ** / * / ` / [text](url) don't leak into snippets
  return noHtml
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .trim()
}

type Track = { id: string; name: string; prize?: string }

type PublicEvent = {
  id: string
  name: string
  description?: string
  banner_url?: string
  status: string
  created_at: string
  tracks?: Track[]
  registration_config?: { open?: boolean }
  registration_deadline?: string
  public_vote?: { enabled?: boolean } | null
  is_hidden?: boolean
}

function statusInfo(status: string, t: (k: TranslationKey) => string) {
  switch (status) {
    case 'recruiting':
      return {
        text: t('pub.status.recruiting'),
        dot: '#22c55e',
        bg: 'rgba(34,197,94,0.1)',
        color: '#22c55e',
        border: 'rgba(34,197,94,0.25)',
      }
    case 'done':
      return {
        text: t('pub.status.done'),
        dot: 'var(--color-fg-subtle)',
        bg: 'var(--color-surface-2)',
        color: 'var(--color-fg-muted)',
        border: 'var(--color-border)',
      }
    case 'hacking':
      return {
        text: t('pub.status.hacking'),
        dot: '#eab308',
        bg: 'rgba(234,179,8,0.1)',
        color: '#eab308',
        border: 'rgba(234,179,8,0.25)',
      }
    case 'judging':
      return {
        text: t('pub.status.judging'),
        dot: '#3b82f6',
        bg: 'rgba(59,130,246,0.1)',
        color: '#3b82f6',
        border: 'rgba(59,130,246,0.25)',
      }
    case 'cancelled':
      return {
        text: t('pub.status.cancelled'),
        dot: 'var(--color-fg-subtle)',
        bg: 'var(--color-surface-2)',
        color: 'var(--color-fg-muted)',
        border: 'var(--color-border)',
      }
    default:
      return {
        text: status,
        dot: 'var(--color-fg-subtle)',
        bg: 'var(--color-surface-2)',
        color: 'var(--color-fg-muted)',
        border: 'var(--color-border)',
      }
  }
}

// Known events whose track-prize sum does not reflect the actual total pool
// (e.g. track prizes only list 1st place, or the organizer publishes a headline
// total in the event description). Keep this map small and explicit.
const EVENT_PRIZE_POOL_OVERRIDES: Record<string, string> = {
  '3cd04217-86e1-4431-9893-709be5998780': '$40K', // Rebel in Paradise
  '7c9c52a8-9ecf-4cf3-8ffd-9f34c4faa183': '$150K', // Mantle Global Hackathon 2025
}

// Extract total prize, preferring event-level override, then falling back to
// summing track prizes.
function getTotalPrize(eventId: string, tracks?: Track[]): string | null {
  const override = EVENT_PRIZE_POOL_OVERRIDES[eventId]
  if (override) return override
  if (!tracks || tracks.length === 0) return null
  const prizes = tracks
    .map(t => t.prize)
    .filter(Boolean)
    .map(p => {
      const m = p!.replace(/,/g, '').match(/[\d.]+/)
      return m ? parseFloat(m[0]) : 0
    })
  if (prizes.length === 0) return null
  const total = prizes.reduce((a, b) => a + b, 0)
  if (total === 0) return null
  if (total >= 1000) return `$${(total / 1000).toFixed(0)}K`
  return `$${total}`
}

// Numeric total prize used for sort comparison. Uses the same precedence as
// `getTotalPrize` (override first, then sum of track prizes).
function getPrizeValue(eventId: string, tracks?: Track[]): number {
  const override = EVENT_PRIZE_POOL_OVERRIDES[eventId]
  if (override) {
    const m = override.replace(/,/g, '').match(/[\d.]+/)
    if (!m) return 0
    const num = parseFloat(m[0])
    return /k/i.test(override) ? num * 1000 : num
  }
  if (!tracks || tracks.length === 0) return 0
  return tracks
    .map(t => t.prize)
    .filter(Boolean)
    .map(p => {
      const m = p!.replace(/,/g, '').match(/[\d.]+/)
      return m ? parseFloat(m[0]) : 0
    })
    .reduce((a, b) => a + b, 0)
}

// Whole days remaining until the given ISO timestamp. Returns null when the
// timestamp is missing or already past — callers use this for an "X days left"
// badge that should disappear once the deadline passes.
function daysUntil(deadline: string | undefined, now: number): number | null {
  if (!deadline) return null
  const ms = new Date(deadline).getTime() - now
  if (ms <= 0) return null
  return Math.ceil(ms / 86_400_000)
}

function EventCard({ event, t, locale, now }: { event: PublicEvent; t: (k: TranslationKey) => string; locale: string; now: number }) {
  const status = statusInfo(event.status, t)
  const isDone = event.status === 'done'
  const prize = getTotalPrize(event.id, event.tracks)
  const trackCount = event.tracks?.length ?? 0
  const voteOpen = !!event.public_vote?.enabled
  const daysLeft = isDone ? null : daysUntil(event.registration_deadline, now)
  const showCountdown = daysLeft !== null && daysLeft <= 7

  return (
    <article>
      <Link
        href={`/events/public/${event.id}`}
        className="group flex flex-col rounded-xl overflow-hidden transition-all duration-200 no-underline"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'inherit',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = 'var(--color-border-strong)'
          el.style.transform = 'translateY(-2px)'
          el.style.boxShadow = '0 8px 30px rgba(0,0,0,0.12)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = 'var(--color-border)'
          el.style.transform = 'translateY(0)'
          el.style.boxShadow = 'none'
        }}
      >
      {/* Banner */}
      <EventCover
        src={event.banner_url}
        alt={event.name}
        imageClassName={`transition-transform duration-300 group-hover:scale-105 ${isDone ? 'grayscale-[40%] opacity-90' : ''}`}
        fallback={<span className="text-5xl opacity-60">🏆</span>}
        fallbackClassName="bg-[linear-gradient(135deg,rgba(99,102,241,0.15)_0%,rgba(168,85,247,0.1)_100%)]"
      >
        {/* Status badge overlay — single primary indicator */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: status.bg,
              color: status.color,
              border: `1px solid ${status.border}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            {isDone ? (
              <span aria-hidden>🏆</span>
            ) : (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: status.dot }}
              />
            )}
            {status.text}
          </span>
          {voteOpen && (
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full"
              style={{
                backgroundColor: 'rgba(59,130,246,0.15)',
                color: '#3b82f6',
                border: '1px solid rgba(59,130,246,0.3)',
                backdropFilter: 'blur(8px)',
              }}
              title={t('pub.voteOpen')}
              aria-label={t('pub.voteOpen')}
            >
              <Vote size={12} />
            </span>
          )}
        </div>
        {/* Prize badge — top right, gold pill */}
        {prize && (
          <div className="absolute top-3 right-3">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.25)',
                boxShadow: '0 2px 8px rgba(217,119,6,0.35)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <Trophy size={11} className="shrink-0" />
              {prize}
            </span>
          </div>
        )}
      </EventCover>
      <div className="flex flex-col flex-1 p-5 gap-2.5">
        {/* Title */}
        <div className="flex items-start gap-2 flex-wrap">
          <h2
            className="font-bold text-[15px] leading-snug line-clamp-2 transition-colors group-hover:text-[var(--color-accent)] flex-1 min-w-0"
            style={{ color: 'var(--color-fg)' }}
          >
            {event.name}
          </h2>
          {event.is_hidden && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                color: 'var(--color-fg-subtle)',
                border: '1px solid var(--color-border)',
              }}
            >
              {t('event.hiddenBadge')}
            </span>
          )}
        </div>

        {/* Key meta — deadline + countdown */}
        {event.registration_deadline && (
          <div className="flex items-center gap-3 flex-wrap text-[12px]">
            <span
              className="inline-flex items-center gap-1"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              <Calendar size={11} className="shrink-0" />
              {isDone ? t('pub.endedAt') : t('pub.deadline')}
              {' · '}
              {formatMonthDay(event.registration_deadline, locale)}
            </span>
            {showCountdown && (
              <span
                className="inline-flex items-center gap-1 font-semibold"
                style={{ color: '#dc2626' }}
              >
                {t('pub.daysLeft').replace('{n}', String(daysLeft))}
              </span>
            )}
          </div>
        )}

        {/* Description — tertiary (HTML stripped for card snippet) */}
        {(() => {
          const snippet = descriptionSnippet(event.description)
          if (!snippet) return null
          return (
            <p
              className="text-[13px] line-clamp-3 leading-relaxed"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {snippet}
            </p>
          )
        })()}

        {/* Tracks — quietest meta, capped at 2 */}
        {trackCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <Tag size={11} style={{ color: 'var(--color-fg-subtle)' }} className="shrink-0" />
            {event.tracks!.slice(0, 2).map(track => (
              <span
                key={track.id}
                className="text-[11px] px-2 py-0.5 rounded-md"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  color: 'var(--color-fg-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {track.name}
              </span>
            ))}
            {trackCount > 2 && (
              <span
                className="text-[11px] px-1.5"
                style={{ color: 'var(--color-fg-subtle)' }}
                title={event.tracks!.slice(2).map(t => t.name).join(', ')}
                aria-label={`${trackCount - 2} more tracks`}
              >
                +{trackCount - 2}
              </span>
            )}
          </div>
        )}

        {/* View details CTA removed — entire card is already clickable (F13) */}
      </div>
      </Link>
    </article>
  )
}

type StatusFilter = 'all' | 'ongoing' | 'done'
type SortMode = 'trending' | 'prize' | 'newest'

export default function PublicEventsClient({ initialEvents }: { initialEvents: PublicEvent[] }) {
  const t = useT()
  const [locale] = useLocale()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [trackFilter, setTrackFilter] = useState<string>('')
  const [sortMode, setSortMode] = useState<SortMode>('trending')

  // Pin to mount time so daysUntil() is stable across renders.
  const [now] = useState(() => Date.now())

  // Unique track names across all events, sorted alphabetically. Used to
  // populate the Track filter dropdown.
  const trackOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of initialEvents) {
      for (const tr of e.tracks ?? []) {
        if (tr.name) set.add(tr.name)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [initialEvents])

  const sortedEvents = useMemo(() => {
    const arr = [...initialEvents]
    if (sortMode === 'prize') {
      arr.sort((a, b) => getPrizeValue(b.id, b.tracks) - getPrizeValue(a.id, a.tracks))
      return arr
    }
    if (sortMode === 'newest') {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      return arr
    }
    // trending: status priority + created_at fallback
    const priority = (s: string) => {
      if (s === 'open') return 0
      if (s === 'judging') return 1
      if (s === 'hacking') return 2
      if (s === 'done') return 3
      return 4
    }
    arr.sort((a, b) => {
      const pa = priority(a.status), pb = priority(b.status)
      if (pa !== pb) return pa - pb
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return arr
  }, [initialEvents, sortMode])

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sortedEvents.filter(e => {
      // Safety net: cancelled events should never appear on the public page,
      // even if they slip past the server-side query.
      if (e.status === 'cancelled') return false
      if (statusFilter === 'ongoing' && !(e.status === 'recruiting' || e.status === 'judging' || e.status === 'hacking')) return false
      if (statusFilter === 'done' && e.status !== 'done') return false
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (trackFilter && !(e.tracks ?? []).some(tr => tr.name === trackFilter)) return false
      return true
    })
  }, [sortedEvents, search, statusFilter, trackFilter])

  const activeCount = sortedEvents.filter(e => e.status === 'recruiting').length

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      <PublicNavbar />

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Page header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} style={{ color: 'var(--color-accent)' }} />
            <span
              className="text-[12px] font-semibold uppercase tracking-widest font-mono"
              style={{ color: 'var(--color-accent)' }}
            >
              Hackathons
            </span>
          </div>
          <h1
            className="text-4xl font-bold tracking-tight mb-3"
            style={{ color: 'var(--color-fg)' }}
          >
            {t('pub.title')}
          </h1>
          <p className="text-base" style={{ color: 'var(--color-fg-muted)' }}>
            {t('pub.subtitle')}
          </p>
          {activeCount > 0 && (
            <div
              className="inline-flex items-center gap-1.5 mt-4 text-[12px] font-medium px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: 'rgba(34,197,94,0.1)',
                color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.2)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              {locale === 'zh' ? `${activeCount} 个活动正在报名中` : `${activeCount} event${activeCount > 1 ? 's' : ''} accepting registrations`}
            </div>
          )}
        </div>

        {/* Search + Sort + Status/Track Filters */}
        {sortedEvents.length > 0 && (
          <div className="flex flex-col gap-3 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--color-fg-subtle)' }}
                />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('pub.searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-fg)',
                  }}
                  aria-label={t('pub.searchPlaceholder')}
                />
              </div>
              <div
                role="tablist"
                aria-label={t('pub.sort.label')}
                className="inline-flex rounded-lg p-1 shrink-0 self-start sm:self-auto gap-1"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {(['trending', 'prize', 'newest'] as const).map(opt => {
                  const active = sortMode === opt
                  const label =
                    opt === 'trending'
                      ? t('pub.sort.trending')
                      : opt === 'prize'
                        ? t('pub.sort.prize')
                        : t('pub.sort.newest')
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={e => { e.preventDefault(); setSortMode(opt) }}
                      className="px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--color-bg)' : 'transparent',
                        color: active ? 'var(--color-fg)' : 'var(--color-fg-muted)',
                        fontWeight: active ? 600 : 500,
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div
                role="tablist"
                aria-label={t('pub.filter.statusLabel')}
                className="inline-flex rounded-lg p-1 shrink-0 self-start gap-1"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {(['all', 'ongoing', 'done'] as const).map(opt => {
                  const active = statusFilter === opt
                  const label =
                    opt === 'all'
                      ? t('pub.filter.all')
                      : opt === 'ongoing'
                        ? t('pub.filter.ongoing')
                        : t('pub.filter.done')
                  // OPE-73: previous version used a big ternary in inline style; in
                  // some setups the button received clicks but the `active` style
                  // barely changed, so the filter looked "dead". Use a dedicated
                  // handler (easier to trace in React DevTools) and make the active
                  // pill much higher-contrast by swapping background + shadow.
                  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
                    e.preventDefault()
                    setStatusFilter(opt)
                  }
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={handleClick}
                      className="px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--color-bg)' : 'transparent',
                        color: active ? 'var(--color-fg)' : 'var(--color-fg-muted)',
                        fontWeight: active ? 600 : 500,
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {trackOptions.length > 0 && (
                <div className="relative shrink-0 self-start">
                  <Tag
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  />
                  <select
                    value={trackFilter}
                    onChange={e => setTrackFilter(e.target.value)}
                    aria-label={t('pub.filter.trackLabel')}
                    className="pl-7 pr-8 py-2 text-sm rounded-lg outline-none cursor-pointer appearance-none transition-colors"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-fg)',
                      backgroundImage:
                        'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27currentColor%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27><polyline points=%276 9 12 15 18 9%27/></svg>")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.625rem center',
                    }}
                  >
                    <option value="">{t('pub.filter.allTracks')}</option>
                    {trackOptions.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty / Loading */}
        {sortedEvents.length === 0 && (
          <div
            className="text-center py-32 text-base"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            {t('pub.empty')}
          </div>
        )}

        {/* No results after filter */}
        {sortedEvents.length > 0 && filteredEvents.length === 0 && (
          <div
            className="text-center py-24 text-base"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            {t('pub.noResults')}
          </div>
        )}

        {/* Grid */}
        {filteredEvents.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredEvents.map(event => (
              <EventCard key={event.id} event={event} t={t} locale={locale} now={now} />
            ))}
          </div>
        )}
      </main>
      <footer className="px-4 sm:px-6 lg:px-8 py-8 border-t border-[var(--color-border)] max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[var(--color-fg-muted)]">
        <span>© 2026 HackAgent</span>
        <div className="flex items-center gap-6">
          <a href="/api/v1/skill.md" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:opacity-80 transition-opacity">Skill</a>
          <a href={locale === 'en' ? '/docs.en.html' : '/docs.html'} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-fg)] transition-colors">{locale === 'zh' ? '文档' : 'Docs'}</a>
        </div>
      </footer>
    </div>
  )
}
