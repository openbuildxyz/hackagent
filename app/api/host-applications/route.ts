import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  name?: string
  email?: string
  org?: string
  event_brief?: string
  expected_size?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function s(v: unknown, max = 2000): string {
  return String(v ?? '').trim().slice(0, max)
}

export async function POST(req: NextRequest) {
  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const name = s(body.name, 200)
  const email = s(body.email, 320)
  const org = s(body.org, 300)
  const event_brief = s(body.event_brief, 5000)
  const expected_size = s(body.expected_size, 200)

  if (!name || !email || !org || !event_brief || !expected_size) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  const ua = req.headers.get('user-agent') ?? null

  try {
    const db = createServiceClient()
    const { error } = await db.from('host_applications').insert({
      name,
      email,
      org,
      event_brief,
      expected_size,
      ip,
      user_agent: ua,
    })

    if (error) {
      // Table missing / migration not applied — still accept politely, log loudly.
      if (error.code === '42P01' || /relation .* does not exist/i.test(error.message)) {
        console.error('[host-applications] table missing; migration 024 pending:', error.message)
        return NextResponse.json(
          { ok: true, pending_infra: true },
          { status: 202 }
        )
      }
      console.error('[host-applications] insert failed:', error)
      return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[host-applications] unexpected:', err)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
