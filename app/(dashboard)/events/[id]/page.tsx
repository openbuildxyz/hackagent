import { redirect } from 'next/navigation'
import { getSessionUserWithRole } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import EventDetailClient from './EventDetailClient'

// Force dynamic rendering — cookies() in SSR must read the live request,
// not a cached/static shell. Without this, Vercel cold-start ISR can
// return a pre-rendered page with no session → 403/blank.
export const dynamic = 'force-dynamic'

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSessionUserWithRole()
  if (!session) redirect('/login')

  const { id } = await params
  const db = createServiceClient()

  const isAdmin = session.isAdmin

  const { data: owned } = await db
    .from('events')
    .select('id')
    .eq('id', id)
    .eq('user_id', session.userId)
    .is('deleted_at', null)
    .maybeSingle()

  let allowed = !!owned || isAdmin
  if (!allowed) {
    const { data: reviewer } = await db
      .from('event_reviewers')
      .select('event_id')
      .eq('event_id', id)
      .eq('user_id', session.userId)
      .maybeSingle()
    if (reviewer) allowed = true
  }

  if (!allowed) {
    // Non-organizer/non-reviewer/non-admin: redirect to the public view.
    // If the event is draft/deleted the public page will 404, which is the correct signal.
    redirect(`/events/public/${id}`)
  }

  return <EventDetailClient />
}
