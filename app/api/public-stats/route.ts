import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const revalidate = 3600 // ISR: 1h

export async function GET() {
  try {
    const db = createServiceClient()
    const { count, error } = await db
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('analysis_status', 'completed')

    if (error) throw error

    return NextResponse.json(
      { projectsReviewed: count ?? 0 },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    )
  } catch (err) {
    return NextResponse.json(
      { projectsReviewed: 0, error: String(err) },
      { status: 200 } // degrade gracefully
    )
  }
}
