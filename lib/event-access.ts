import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlatformAdmin as hasPlatformAdminRole, normalizeRoles } from '@/lib/permissions'

export type EventManagerSession = {
  userId: string
  isAdmin?: boolean
}

export type EventManagerAccess<TEvent = Record<string, unknown>> =
  | { ok: true; event: TEvent; isOwner: boolean; isCoOrganizer: boolean; isPlatformAdmin: boolean }
  | { ok: false; status: 403 | 404; error: string }

/**
 * Event manager access is deliberately event-scoped:
 * owner OR platform admin OR an event_co_organizers membership.
 *
 * This helper must not be used for /api/admin routes. Co-organizers are not
 * platform admins and must not inherit platform-wide access.
 */
export async function getEventManagerAccess<TEvent extends { user_id: string }>(
  db: SupabaseClient,
  eventId: string,
  session: EventManagerSession,
  options: { select?: string; includeDeleted?: boolean } = {}
): Promise<EventManagerAccess<TEvent>> {
  let query = db
    .from('events')
    .select(options.select ?? '*')
    .eq('id', eventId)

  if (!options.includeDeleted) query = query.is('deleted_at', null)

  const { data: event } = await query.maybeSingle() as { data: TEvent | null }
  if (!event) return { ok: false, status: 404, error: 'Event not found' }

  const isOwner = event.user_id === session.userId
  let isPlatformAdmin = Boolean(session.isAdmin)
  if (!isPlatformAdmin && session.isAdmin === undefined) {
    const { data: user } = await db
      .from('users')
      .select('role')
      .eq('id', session.userId)
      .maybeSingle()
    isPlatformAdmin = hasPlatformAdminRole(normalizeRoles(user?.role))
  }
  if (isOwner || isPlatformAdmin) {
    return { ok: true, event, isOwner, isCoOrganizer: false, isPlatformAdmin }
  }

  const { data: membership, error: membershipError } = await db
    .from('event_co_organizers')
    .select('event_id')
    .eq('event_id', eventId)
    .eq('user_id', session.userId)
    .eq('role', 'co_organizer')
    .maybeSingle()

  if (membership) return { ok: true, event, isOwner, isCoOrganizer: true, isPlatformAdmin }

  // Backward-compatible production fallback while the migration is rolling out:
  // existing deployments already have event_reviewers, so an invite_status value
  // of co_organizer can represent the same event-scoped manager grant without
  // granting normal reviewer access or platform admin access.
  if (membershipError?.code === 'PGRST205' || /event_co_organizers/i.test(membershipError?.message ?? '')) {
    const { data: legacyMembership } = await db
      .from('event_reviewers')
      .select('event_id')
      .eq('event_id', eventId)
      .eq('user_id', session.userId)
      .eq('invite_status', 'co_organizer')
      .maybeSingle()
    if (legacyMembership) return { ok: true, event, isOwner, isCoOrganizer: true, isPlatformAdmin }
  }

  return { ok: false, status: 403, error: 'Forbidden' }
}

export async function isEventManager(
  db: SupabaseClient,
  eventId: string,
  session: EventManagerSession
): Promise<boolean> {
  const access = await getEventManagerAccess(db, eventId, session, { select: 'id, user_id' })
  return access.ok
}
