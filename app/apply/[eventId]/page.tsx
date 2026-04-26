import { notFound, redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import ApplyClient, { type EventConfig } from './ApplyClient'

export const revalidate = 30

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params

  const session = await getSessionUser()
  if (!session) {
    redirect(`/login?redirect=${encodeURIComponent(`/apply/${eventId}`)}`)
  }

  const db = createServiceClient()

  const { data: event, error } = await db
    .from('events')
    .select('id, name, description, track, tracks, registration_config, registration_deadline, submission_deadline, banner_url')
    .eq('id', eventId)
    .is('deleted_at', null)
    .single()

  if (error || !event) notFound()

  return <ApplyClient eventConfig={event as EventConfig} />
}
