import { createServiceClient } from '@/lib/supabase'

/**
 * Write an entry to admin_audit_log. Fire-and-forget — never throws.
 * Call this only on admin-privileged code paths (isAdmin === true).
 *
 * action       — short verb, e.g. 'event.update', 'registration.approve', 'user.role.change'
 * target_type  — 'event' | 'registration' | 'user' | 'api_key' | 'project' | ...
 * target_id    — the primary id of the row being changed
 * before/after — snapshot of the row (optional; keep small)
 * metadata     — extra context (reason, IP, etc.)
 */
export async function recordAdminAction(opts: {
  adminUserId: string
  action: string
  target_type: string
  target_id?: string | null
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const db = createServiceClient()
    await db.from('admin_audit_log').insert({
      admin_user_id: opts.adminUserId,
      action: opts.action,
      target_type: opts.target_type,
      target_id: opts.target_id ?? null,
      before_data: opts.before ?? null,
      after_data: opts.after ?? null,
      metadata: opts.metadata ?? null,
    })
  } catch (err) {
    console.warn('[admin-audit] failed to record', opts.action, err)
  }
}
