import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { getServerLocale } from '@/lib/i18n-server'
import { formatDateLong } from '@/lib/format-date'

// OPE-126: Force dynamic rendering — Vercel ISR can cache a no-session shell on cold start.
export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRight, ClipboardList } from 'lucide-react'
import EventCover from '@/components/EventCover'

export default async function MyReviewsPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const locale = await getServerLocale()

  const db = createServiceClient()

  // 查该用户作为评委参与的所有活动
  const { data: reviewerRows } = await db
    .from('event_reviewers')
    .select('event_id, invite_status')
    .eq('user_id', session.userId)
    .in('invite_status', ['accepted', 'active'])

  const eventIds = (reviewerRows ?? []).map(r => r.event_id)

  const { data: events } = eventIds.length > 0
    ? await db
        .from('events')
        .select('id, name, status, banner_url, created_at, models')
        .in('id', eventIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
    : { data: [] }

  // 查各活动的提交进度
  const { data: finalScores } = eventIds.length > 0
    ? await db
        .from('reviewer_final_scores')
        .select('event_id')
        .eq('reviewer_id', session.userId)
    : { data: [] }

  const submittedEvents = new Set((finalScores ?? []).map(s => s.event_id))

  const STATUS_MAP: Record<string, { label: string; en: string; variant: 'default' | 'secondary' | 'outline' }> = {
    draft:   { label: '草稿',   en: 'Draft',     variant: 'secondary' },
    open:    { label: '报名中', en: 'Open',      variant: 'default' },
    closed:  { label: '提交中', en: 'Closed',    variant: 'default' },
    judging: { label: '评审中', en: 'Judging',   variant: 'default' },
    done:    { label: '已完成', en: 'Done',      variant: 'outline' },
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-8">
        <ClipboardList size={22} className="text-fg-muted" />
        <div>
          <h1 className="text-2xl font-bold">我的评审</h1>
          <p className="text-muted-foreground text-sm mt-0.5">你被邀请参与评审的活动</p>
        </div>
      </div>

      {!events || events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center mb-4">
            <ClipboardList size={28} className="text-fg-subtle" />
          </div>
          <h2 className="text-lg font-semibold mb-2">暂无评审活动</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            等待组织方发送评委邀请邮件，接受邀请后活动将显示在这里。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(events ?? []).map(event => {
            const st = STATUS_MAP[event.status] ?? STATUS_MAP.draft
            const submitted = submittedEvents.has(event.id)
            return (
              <div key={event.id} className="rounded-xl border border-token overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                <EventCover
                  src={event.banner_url}
                  fallback={null}
                  fallbackClassName="bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-border)]"
                />
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-fg leading-tight line-clamp-2">{event.name}</h3>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                      {submitted && (
                        <span className="text-xs text-green-600 font-medium">✓ 已提交</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mb-4">
                    {event.models?.length ?? 0} 个模型 · {formatDateLong(event.created_at, locale)}
                  </div>
                  <div className="mt-auto">
                    <Link href={`/events/${event.id}/reviewer`}>
                      <Button variant={submitted ? 'outline' : 'default'} size="sm" className="w-full gap-1.5">
                        {submitted ? '查看评分' : '进入评审'}
                        <ArrowRight size={13} />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
