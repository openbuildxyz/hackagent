import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
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

  // Pure viewers (no admin/organizer role) have no events to manage —
  // redirect them to the public events page instead of showing an empty dashboard.
  if (!canManage) {
    redirect('/events/public')
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
