'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Clock } from 'lucide-react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'
import EventCover from '@/components/EventCover'
import EventRegistrationForm, { type EventRegistrationConfig } from '@/components/EventRegistrationForm'

// Strip HTML tags with a simple regex — no jsdom (isomorphic-dompurify pulls jsdom
// into the server chunk and crashes SSR with ERR_REQUIRE_ESM).
// Used for plain-text display of the event description.
function stripHtml(html: string): string {
  return html
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
    .trim()
}

export interface EventConfig extends EventRegistrationConfig {
  id: string
  name: string
  description: string | null
  track: string | null
  registration_deadline: string | null
  submission_deadline: string | null
  banner_url: string | null
}

function useCountdown(deadline: string | null) {
  const [remaining, setRemaining] = useState<{ d: number; h: number; m: number; s: number } | null>(null)

  useEffect(() => {
    if (!deadline) return
    const tick = () => {
      const diff = new Date(deadline).getTime() - Date.now()
      if (diff <= 0) { setRemaining(null); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining({ d, h, m, s })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  return remaining
}

function CountdownChip({
  label,
  deadline,
  remaining,
  closedLabel,
  t,
}: {
  label: string
  deadline: string
  remaining: { d: number; h: number; m: number; s: number } | null
  closedLabel: string
  t: (key: Parameters<ReturnType<typeof useT>>[0]) => string
}) {
  const isClosed = new Date(deadline) < new Date()
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-token bg-surface-1 px-3 py-1.5 text-xs">
      <Clock size={12} className="text-fg-subtle" />
      <span className="text-fg-subtle">{label}</span>
      {isClosed || !remaining ? (
        <span className="font-medium text-amber-700">{closedLabel}</span>
      ) : (
        <span className="font-mono font-medium text-foreground">
          {remaining.d > 0 && `${remaining.d}${t('reg.countdownDay')} `}
          {`${String(remaining.h).padStart(2, '0')}${t('reg.countdownHour')} ${String(remaining.m).padStart(2, '0')}${t('reg.countdownMin')} ${String(remaining.s).padStart(2, '0')}${t('reg.countdownSec')}`}
        </span>
      )}
    </div>
  )
}

export default function ApplyClient({ eventConfig }: { eventConfig: EventConfig }) {
  const t = useT()
  const eventId = eventConfig.id

  const regCountdown = useCountdown(eventConfig.registration_deadline)
  const subCountdown = useCountdown(eventConfig.submission_deadline)

  const config = eventConfig.registration_config
  const isOpen = config?.open ?? false
  const description = eventConfig.description ? stripHtml(eventConfig.description) : ''

  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href={`/events/public/${eventId}`} className="text-sm text-fg-subtle hover:text-fg">
            {t('apply.viewEvent')}
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] lg:items-start">
          <section className="space-y-5">
            {eventConfig.banner_url && (
              <EventCover src={eventConfig.banner_url} className="rounded-xl" />
            )}

            <div className="rounded-xl border border-token bg-surface-1 p-6">
              <Badge variant="secondary" className="mb-3">{t('reg.applyBtn')}</Badge>
              <h1 className="text-3xl font-bold leading-tight text-fg">{eventConfig.name}</h1>
              {description && (
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                  {description.length > 520 ? `${description.slice(0, 520)}...` : description}
                </p>
              )}
            </div>

            {isOpen && (eventConfig.registration_deadline || eventConfig.submission_deadline) && (
              <div className="rounded-xl border border-token bg-surface-1 p-5">
                <p className="mb-3 text-sm font-medium text-fg">{t('reg.applyBtn')}</p>
                <div className="flex flex-wrap gap-2">
                  {eventConfig.registration_deadline && (
                    <CountdownChip
                      label={t('reg.countdown.registration')}
                      deadline={eventConfig.registration_deadline}
                      remaining={regCountdown}
                      closedLabel={t('reg.countdown.closed')}
                      t={t}
                    />
                  )}
                  {eventConfig.submission_deadline && (
                    <CountdownChip
                      label={t('reg.countdown.submission')}
                      deadline={eventConfig.submission_deadline}
                      remaining={subCountdown}
                      closedLabel={t('reg.countdown.closed')}
                      t={t}
                    />
                  )}
                </div>
              </div>
            )}
          </section>

          <EventRegistrationForm eventConfig={eventConfig} redirectPath={`/apply/${eventId}`} mode="page" />
        </div>
      </div>
    </div>
  )
}
