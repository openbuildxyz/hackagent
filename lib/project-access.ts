import type { SupabaseClient } from '@supabase/supabase-js'

export type ProjectAccessResult =
  | { ok: true; project: { id: string; event_id: string; event_owner_id: string | null } }
  | { ok: false; status: 401 | 403 | 404; error: string }

/**
 * Unified read-access check for a project's internal data (scores, analysis_result, etc).
 *
 * Rules:
 * - event owner → allow
 * - reviewer (invite_status ∈ {accepted, active}) of the project's event → allow
 * - admin (users.role contains 'admin') → allow
 * - else → 403
 * - missing project → 404
 * - missing session → 401
 *
 * Public/anonymous exposure should NOT use this path; route those via
 * `/api/public/...` which apply draft filters and field whitelists.
 */
export async function assertProjectReadable(
  db: SupabaseClient,
  projectId: string,
  session: { userId: string } | null
): Promise<ProjectAccessResult> {
  if (!session) return { ok: false, status: 401, error: 'Unauthorized' }

  const { data: project } = await db
    .from('projects')
    .select('id, event_id, events(user_id)')
    .eq('id', projectId)
    .single()

  if (!project) return { ok: false, status: 404, error: 'Not found' }

  const eventOwnerId = (project.events as { user_id?: string } | null)?.user_id ?? null
  if (eventOwnerId === session.userId) {
    return { ok: true, project: { id: project.id, event_id: project.event_id, event_owner_id: eventOwnerId } }
  }

  const { data: reviewer } = await db
    .from('event_reviewers')
    .select('id')
    .eq('event_id', project.event_id)
    .eq('user_id', session.userId)
    .in('invite_status', ['accepted', 'active'])
    .maybeSingle()
  if (reviewer) {
    return { ok: true, project: { id: project.id, event_id: project.event_id, event_owner_id: eventOwnerId } }
  }

  // Admin bypass (OPE-25 convention: users.role is text[] containing 'admin')
  const { data: userRow } = await db
    .from('users')
    .select('role')
    .eq('id', session.userId)
    .maybeSingle()
  const role: string[] = Array.isArray(userRow?.role)
    ? (userRow!.role as string[])
    : userRow?.role
      ? [String(userRow.role)]
      : []
  if (role.includes('admin')) {
    return { ok: true, project: { id: project.id, event_id: project.event_id, event_owner_id: eventOwnerId } }
  }

  return { ok: false, status: 403, error: 'Forbidden' }
}
