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

  if (!canManage) {
    const { data: ownedAgents } = await db
      .from('agents')
      .select('id')
      .eq('owner_user_id', session.userId)
      .is('deleted_at', null)

    const agentIds = (ownedAgents ?? []).map((agent) => agent.id).filter(Boolean)
    const { data: userRegistrations } = await db
      .from('registrations')
      .select('id, event_id, status, agent_id, created_at')
      .eq('user_id', session.userId)
      .order('created_at', { ascending: false })

    const agentRegistrations = agentIds.length > 0
      ? await db
        .from('registrations')
        .select('id, event_id, status, agent_id, created_at')
        .in('agent_id', agentIds)
        .order('created_at', { ascending: false })
      : { data: [] as Array<{ id: string; event_id: string; status: string | null; agent_id: string | null; created_at: string }> }

    type RegistrationRow = {
      id: string
      event_id: string
      status: string | null
      agent_id: string | null
      created_at: string
    }
    const registrationByEvent = new Map<string, RegistrationRow[]>()
    for (const reg of [...(userRegistrations ?? []), ...(agentRegistrations.data ?? [])] as RegistrationRow[]) {
      if (!reg.event_id) continue
      registrationByEvent.set(reg.event_id, [...(registrationByEvent.get(reg.event_id) ?? []), reg])
    }

    const eventIds = [...registrationByEvent.keys()]
    let summaries: EventSummary[] = []
    if (eventIds.length > 0) {
      const { data: events } = await db
        .from('events')
        .select('id, name, track, banner_url, status, models, registration_config, created_at, is_hidden')
        .in('id', eventIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      const { data: projectCounts } = await db
        .from('projects')
        .select('event_id')
        .in('event_id', eventIds)

      const countByEvent = (projectCounts ?? []).reduce(
        (acc, p) => {
          acc[p.event_id] = (acc[p.event_id] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

      summaries = (events ?? []).map((e) => {
        const regs = registrationByEvent.get(e.id) ?? []
        const human = regs.some((reg) => !reg.agent_id)
        const agentCount = new Set(regs.map((reg) => reg.agent_id).filter(Boolean)).size
        const registrationStatus = regs.find((reg) => !reg.agent_id)?.status ?? regs[0]?.status ?? null
        return {
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
          participation: {
            registration_status: registrationStatus,
            human,
            agent_count: agentCount,
          },
        }
      })
    }

    return <EventsPageClient events={summaries} canManage={false} />
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
