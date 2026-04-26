import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import CreditsClient from './CreditsClient'

// OPE-126: Force dynamic rendering — Vercel ISR can cache a no-session shell on cold start.
export const dynamic = 'force-dynamic'

export default async function CreditsPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const db = createServiceClient()
  const { data: user } = await db
    .from('users')
    .select('credits')
    .eq('id', session.userId)
    .single()

  return <CreditsClient initialBalance={user?.credits ?? 0} />
}
