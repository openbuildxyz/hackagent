import { NextResponse } from 'next/server'
import { getAdminModelConfigSnapshot, testAdminModelConnection } from '@/lib/admin-model-config'
import { getSessionUserWithRole } from '@/lib/session'

export async function GET() {
  const session = await getSessionUserWithRole()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(getAdminModelConfigSnapshot())
}

export async function POST(request: Request) {
  const session = await getSessionUserWithRole()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { type?: string; key?: string }
  if ((body.type !== 'model' && body.type !== 'service') || !body.key || typeof body.key !== 'string') {
    return NextResponse.json({ error: 'Invalid test target' }, { status: 400 })
  }

  const result = await testAdminModelConnection({ type: body.type, key: body.key })
  return NextResponse.json(result, { status: result.status === 'missing' ? 400 : 200 })
}
