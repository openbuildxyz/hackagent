import { createServiceClient } from '@/lib/supabase'
import EventDetailClient, { type EventDetail } from './EventDetailClient'
import PublicEventNotFound from './PublicEventNotFound'

export const revalidate = 60

export default async function PublicEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  const db = createServiceClient()

  const { data: event } = await db
    .from('events')
    .select('id, name, description, status, registration_config, tracks, registration_deadline, submission_deadline, result_announced_at, banner_url, public_vote, cancelled_reason')
    .eq('id', eventId)
    .neq('status', 'draft')
    .is('deleted_at', null)
    .single()

  if (!event) return <PublicEventNotFound />

  return <EventDetailClient event={event as EventDetail} />
}
