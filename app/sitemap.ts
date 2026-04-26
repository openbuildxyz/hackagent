import type { MetadataRoute } from 'next'
import { createServiceClient } from '@/lib/supabase'

const BASE = 'https://hackathon.xyz'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const staticRoutes: MetadataRoute.Sitemap = [
    '',
    '/events/public',
    '/apply-to-host',
    '/api-docs',
    '/login',
    '/docs.html',
  ].map(p => ({
    url: `${BASE}${p}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1 : 0.7,
  }))

  let eventRoutes: MetadataRoute.Sitemap = []
  try {
    const db = createServiceClient()
    const { data: events } = await db
      .from('events')
      .select('id, updated_at')
      .is('deleted_at', null)
      .neq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(5000)

    eventRoutes = (events ?? []).map(e => ({
      url: `${BASE}/events/public/${e.id}`,
      lastModified: e.updated_at ? new Date(e.updated_at) : now,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    }))
  } catch {
    // If DB fetch fails, fall back to static-only sitemap
  }

  return [...staticRoutes, ...eventRoutes]
}
