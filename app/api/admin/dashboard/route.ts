import { NextResponse } from 'next/server'
import { getAdminModelConfigSnapshot } from '@/lib/admin-model-config'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionUserWithRole } from '@/lib/session'

export async function GET() {
  const session = await getSessionUserWithRole()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = createServiceClient()
  const { data: users, error } = await db
    .from('users')
    .select('id, role, credits, created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = users ?? []
  const roles = rows.reduce<Record<string, number>>((acc, user) => {
    const userRoles = Array.isArray(user.role) ? user.role : user.role ? [String(user.role)] : ['viewer']
    userRoles.forEach((role) => {
      acc[role] = (acc[role] ?? 0) + 1
    })
    return acc
  }, {})
  const credits = rows.reduce((sum, user) => sum + (Number(user.credits) || 0), 0)
  const config = getAdminModelConfigSnapshot()

  return NextResponse.json({
    users: {
      total: rows.length,
      roles,
      credits,
      latestCreatedAt: rows
        .map((user) => user.created_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    },
    configuration: {
      models: config.models.length,
      configuredModels: config.models.filter((model) => model.configured).length,
      services: config.services.length,
      missingServices: config.services.filter((service) => service.status === 'missing').length,
      readOnly: config.readOnly,
    },
  })
}
