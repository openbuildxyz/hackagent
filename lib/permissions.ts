export const ROLES = ['admin', 'organizer', 'reviewer', 'viewer'] as const

export type AppRole = (typeof ROLES)[number] | 'super_admin'

export function normalizeRoles(role: unknown): string[] {
  if (Array.isArray(role)) return role.map(String).filter(Boolean)
  if (role) return [String(role)]
  return ['viewer']
}

export function hasRole(roles: readonly string[] | null | undefined, role: AppRole): boolean {
  return Boolean(roles?.includes(role))
}

export function isPlatformAdmin(roles: readonly string[] | null | undefined): boolean {
  return hasRole(roles, 'admin') || hasRole(roles, 'super_admin')
}

export function canCreateEvents(roles: readonly string[] | null | undefined): boolean {
  return isPlatformAdmin(roles) || hasRole(roles, 'organizer')
}

export function canUseReviewerTools(roles: readonly string[] | null | undefined): boolean {
  return hasRole(roles, 'reviewer')
}
