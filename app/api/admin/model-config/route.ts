import { NextResponse } from 'next/server'
import { getAdminModelConfigSnapshot } from '@/lib/admin-model-config'
import { getSessionUserWithRole } from '@/lib/session'

export async function GET() {
  const session = await getSessionUserWithRole()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(getAdminModelConfigSnapshot())
}
