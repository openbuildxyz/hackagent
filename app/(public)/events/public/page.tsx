import { createServiceClient } from '@/lib/supabase'
import PublicEventsClient from './PublicEventsClient'

export const revalidate = 0 // always fresh

export default async function PublicEventsPage() {
  const db = createServiceClient()
  const { data: events } = await db
    .from('events')
    .select('id, name, description, banner_url, status, created_at, tracks, registration_config, registration_deadline, public_vote, is_hidden')
    .is('deleted_at', null)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .neq('status', 'draft')
    .neq('status', 'cancelled')
    .not('name', 'ilike', '%test%')
    .not('name', 'ilike', '%qa%')
    .not('name', 'ilike', '%e2e%')
    .not('name', 'ilike', '%ope-%')
    .not('name', 'ilike', '%测试%')
    .order('created_at', { ascending: false })

  const filtered = events ?? []

  return <PublicEventsClient initialEvents={filtered} />
}
