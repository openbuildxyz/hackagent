import { createServiceClient } from '@/lib/supabase'
import PublicEventsClient from './PublicEventsClient'

export const revalidate = 0 // always fresh

export default async function PublicEventsPage() {
  const db = createServiceClient()
  const { data: events } = await db
    .from('events')
    .select('id, name, description, banner_url, status, created_at, tracks, registration_config, registration_deadline, public_vote')
    .is('deleted_at', null)
    .neq('status', 'draft')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  // Only hide finished events whose names look like test/QA fixtures; live events
  // with "test" in the name (e.g. "TestNet Hackathon") remain visible.
  const filtered = (events ?? []).filter(
    e => !(e.status === 'done' && /test|测试|E2E/i.test(e.name))
  )

  return <PublicEventsClient initialEvents={filtered} />
}
