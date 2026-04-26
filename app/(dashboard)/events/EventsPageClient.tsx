'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Folder, ArrowRight, ExternalLink } from 'lucide-react'
import DeleteEventButton from '../DeleteEventButton'
import { useT, type TranslationKey } from '@/lib/i18n'

export type EventSummary = {
  id: string
  name: string
  track: string | null
  banner_url: string | null
  status: string
  models: string[]
  registration_config: { open?: boolean } | null
  created_at: string
  project_count: number
  is_hidden?: boolean
}

function getDisplayStatus(e: EventSummary) {
  const status = e.status ?? 'draft'
  if (status === 'judging') return 'judging'
  if (status === 'done') return 'done'
  if (status === 'recruiting') return 'recruiting'
  if (status === 'hacking') return 'hacking'
  if (status === 'inactive') return 'inactive'
  return status || 'draft'
}

const STATUS_STYLES: Record<string, { color?: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft:    { variant: 'secondary' },
  inactive: { variant: 'secondary' },
  recruiting: { variant: 'default', color: 'bg-green-100 text-green-700 border-green-200' },
  hacking:  { variant: 'secondary' },
  judging:  { variant: 'default', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  done:     { variant: 'outline' },
}

const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  draft:    'dashboard.status.draft',
  inactive: 'dashboard.status.inactive',
  recruiting: 'dashboard.status.recruiting',
  hacking:  'dashboard.status.hacking',
  judging:  'dashboard.status.judging',
  done:     'dashboard.status.done',
}

export default function EventsPageClient({ events, canManage }: { events: EventSummary[]; canManage: boolean }) {
  const t = useT()

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('dashboard.subtitle')}</p>
        </div>
        {canManage && (
          <Link href="/events/new">
            <Button>
              <Plus size={16} className="mr-2" />
              {t('dashboard.new')}
            </Button>
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center mb-4">
            <Folder size={28} className="text-fg-subtle" />
          </div>
          <h2 className="text-lg font-semibold mb-2">{canManage ? t('dashboard.empty.title') : t('dashboard.empty.viewerTitle')}</h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm">
            {canManage ? t('dashboard.empty.desc') : t('dashboard.empty.viewerDesc')}
          </p>
          {canManage ? (
            <Link href="/events/new">
              <Button>
                <Plus size={16} className="mr-2" />
                {t('dashboard.new')}
              </Button>
            </Link>
          ) : (
            <Link href="/events/public">
              <Button variant="outline">{t('dashboard.browseEvents')}</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map(event => {
            const displayStatus = getDisplayStatus(event)
            const style = STATUS_STYLES[displayStatus] ?? STATUS_STYLES.draft
            const label = t(STATUS_LABEL_KEYS[displayStatus] ?? 'dashboard.status.draft')
            // Deterministic ISO date (YYYY-MM-DD) to avoid hydration mismatch (#418):
            // Node ICU on the server can format toLocaleDateString differently from
            // the client's V8, and `locale` comes from client-only context on initial paint.
            const createdAt = (event.created_at || '').slice(0, 10)

            return (
              <Card key={event.id} className="hover:shadow-md transition-shadow overflow-hidden">
                {event.banner_url ? (
                  <div className="w-full aspect-video overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={event.banner_url} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-full aspect-video bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-border)]" />
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <CardTitle className="text-base leading-tight line-clamp-2">{event.name}</CardTitle>
                      {event.is_hidden && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {t('event.hiddenBadge')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={style.variant} className={`text-xs ${style.color ?? ''}`}>
                        {label}
                      </Badge>
                      {canManage && <DeleteEventButton eventId={event.id} />}
                    </div>
                  </div>
                  {event.track && (
                    <p className="text-xs text-muted-foreground">{event.track}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                    <span>{t(event.project_count === 1 ? 'dashboard.stat.projects.one' : 'dashboard.stat.projects').replace('{n}', String(event.project_count))}</span>
                    <span>{t((event.models?.length ?? 0) === 1 ? 'dashboard.stat.models.one' : 'dashboard.stat.models').replace('{n}', String(event.models?.length ?? 0))}</span>
                    <span>{createdAt}</span>
                  </div>

                  <div className="flex gap-2">
                    {canManage ? (
                      <Link href={`/events/${event.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full gap-1.5 cursor-pointer">
                          {t('dashboard.manage')}
                          <ArrowRight size={13} />
                        </Button>
                      </Link>
                    ) : (
                      <Link href={`/events/public/${event.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full gap-1.5 cursor-pointer">
                          {t('pub.detail.viewResults')}
                          <ExternalLink size={13} />
                        </Button>
                      </Link>
                    )}
                    {event.status === 'done' && (
                      <Link href={`/report/${event.id}`} target="_blank">
                        <Button variant="secondary" size="sm" className="gap-1.5">
                          {t('dashboard.report')}
                          <ExternalLink size={13} />
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
