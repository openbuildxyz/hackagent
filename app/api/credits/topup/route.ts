import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'

/**
 * Credit top-up disabled (OPE-26): previous implementation granted credits
 * without any payment verification, enabling unlimited free top-ups.
 * Keeping the endpoint registered (401 for anon, 403 for authed) so the
 * frontend can render a clear "contact support" state instead of 404.
 * Re-enable after integrating a payment gateway (Stripe/支付宝/微信) with
 * signed webhooks + idempotent order ledger.
 */
export async function POST(_req: NextRequest) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  return NextResponse.json(
    {
      error: 'Credit top-up is temporarily disabled. Please contact support.',
      code: 'TOPUP_DISABLED',
    },
    { status: 403 }
  )
}
