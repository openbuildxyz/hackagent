import Link from 'next/link'
import { ArrowRight, ExternalLink, LockKeyhole } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { getServerLocale } from '@/lib/i18n-server'
import EventsPageClient, { type EventSummary } from '../events/EventsPageClient'

// OPE-126: Force dynamic rendering — Vercel ISR can cache a no-session shell on cold start.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const db = createServiceClient()

  const { data: userRow } = await db
    .from('users')
    .select('role')
    .eq('id', session.userId)
    .single()
  const roles: string[] = Array.isArray(userRow?.role)
    ? userRow!.role
    : userRow?.role
      ? [userRow.role as string]
      : ['viewer']
  const canManage = roles.includes('admin') || roles.includes('organizer')
  const isAdmin = roles.includes('admin')
  const isReviewer = roles.includes('reviewer')
  const locale = await getServerLocale()

  // Reviewers have a dashboard area, but their entry point is the review queue.
  if (!canManage && isReviewer) {
    redirect('/my-reviews')
  }

  // Pure viewers have no management workspace. Do not silently redirect them
  // to the public site: it looks like the dashboard is broken. Show a clear
  // access page with the next available action instead.
  if (!canManage) {
    const zh = locale === 'zh'
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center py-10">
        <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 sm:p-10 shadow-sm">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <LockKeyhole size={22} />
          </div>
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            {zh ? '需要组织方权限' : 'Organizer access required'}
          </p>
          <h1 className="mb-3 text-2xl font-bold tracking-tight text-[var(--color-fg)] sm:text-3xl">
            {zh ? '当前账号还不能访问控制台' : 'This account cannot access the dashboard yet'}
          </h1>
          <p className="mb-7 text-sm leading-6 text-[var(--color-fg-muted)] sm:text-base">
            {zh
              ? '控制台用于创建和管理 Hackathon 活动，需要 organizer 或 admin 角色。你仍然可以浏览公开活动；如果需要发布活动，请联系 OpenBuild 开通组织方权限。'
              : 'The dashboard is for creating and managing hackathon events, so it requires the organizer or admin role. You can still browse public events. Contact OpenBuild if you need organizer access.'}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/events/public"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--color-fg)] px-4 text-sm font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90"
            >
              {zh ? '浏览公开活动' : 'Browse public events'} <ArrowRight size={15} />
            </Link>
            <a
              href="mailto:hackagent@openbuild.xyz?subject=HackAgent%20organizer%20access"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-fg)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              {zh ? '申请组织方权限' : 'Request organizer access'} <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    )
  }

  // OPE-25: admin 看全部活动；非 admin 仅看自己名下
  let eventsQuery = db
    .from('events')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (!isAdmin) {
    eventsQuery = eventsQuery.eq('user_id', session.userId)
  }
  const { data: events } = await eventsQuery

  const { data: projectCounts } = await db
    .from('projects')
    .select('event_id')
    .in('event_id', events?.map(e => e.id) ?? [])

  const countByEvent = (projectCounts ?? []).reduce(
    (acc, p) => {
      acc[p.event_id] = (acc[p.event_id] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const summaries: EventSummary[] = (events ?? []).map(e => ({
    id: e.id,
    name: e.name,
    track: e.track ?? null,
    banner_url: e.banner_url ?? null,
    status: e.status ?? 'draft',
    models: e.models ?? [],
    registration_config: e.registration_config ?? null,
    created_at: e.created_at,
    project_count: countByEvent[e.id] ?? 0,
    is_hidden: e.is_hidden ?? false,
  }))

  return <EventsPageClient events={summaries} canManage={canManage} />
}
