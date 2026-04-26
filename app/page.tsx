import { createServiceClient } from '@/lib/supabase'
import LandingClient from './LandingClient'

export const revalidate = 3600

async function getProjectsReviewed(): Promise<number | null> {
  try {
    const db = createServiceClient()
    const { count, error } = await db
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('analysis_status', 'completed')
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

export default async function LandingPage() {
  const projectsReviewed = await getProjectsReviewed()
  return <LandingClient initialProjectsReviewed={projectsReviewed} />
}
