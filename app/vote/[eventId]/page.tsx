import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'
import VoteClient from './VoteClient'
import VoteNotAvailable from './VoteNotAvailable'

type PublicVoteConfig = {
  enabled: boolean
  title: string
  description: string
  vote_limit: number
  ends_at: string | null
  visible_fields: string[]
  show_ai_score: boolean
  show_realtime_count: boolean
}

export default async function VotePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params

  const session = await getSessionUser()
  // 不强制登录，userId 为 null 时前端点投票再提示

  const supabase = createServiceClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, name, description, public_vote, tracks, banner_url')
    .eq('id', eventId)
    .single()

  if (!event) notFound()

  const cfg = event.public_vote as PublicVoteConfig | null
  if (!cfg?.enabled) {
    return <VoteNotAvailable />
  }

  // Fetch projects
  const { data: allProjects } = await supabase
    .from('projects')
    .select('id, name, team_name, description, demo_url, github_url, tags, track_ids')
    .eq('event_id', eventId)

  const visibleFields = cfg.visible_fields ?? []
  const projects = (allProjects ?? []).map((p) => {
    const out: Record<string, unknown> = { id: p.id, name: p.name, team_name: p.team_name, track_ids: (p as {track_ids?: string[]}).track_ids ?? [] }
    if (visibleFields.includes('description')) out.description = p.description
    if (visibleFields.includes('demo_url')) out.demo_url = p.demo_url
    if (visibleFields.includes('github_url')) out.github_url = p.github_url
    if (visibleFields.includes('tags')) out.tags = p.tags
    return out
  })

  type Track = { id: string; name: string; description?: string; prize?: string }
  const eventTracks: Track[] = Array.isArray((event as unknown as { tracks?: unknown }).tracks)
    ? ((event as unknown as { tracks: Track[] }).tracks)
    : []

  // Vote counts
  const voteCounts: Record<string, number> = {}
  if (cfg.show_realtime_count) {
    const { data: counts } = await supabase
      .from('public_votes')
      .select('project_id')
      .eq('event_id', eventId)
    if (counts) {
      for (const row of counts) {
        voteCounts[row.project_id] = (voteCounts[row.project_id] ?? 0) + 1
      }
    }
  }

  // Fetch user's existing votes (only if logged in)
  let initialMyVotes: string[] = []
  if (session) {
    const { data: myVoteRows } = await supabase
      .from('public_votes')
      .select('project_id')
      .eq('event_id', eventId)
      .eq('voter_user_id', session.userId)
    initialMyVotes = (myVoteRows ?? []).map((v) => v.project_id)
  }

  const eventInfo = {
    id: event.id,
    name: event.name,
    description: event.description,
    title: cfg.title || event.name,
    vote_config_description: cfg.description,
    vote_limit: cfg.vote_limit ?? 3,
    ends_at: cfg.ends_at ?? null,
    show_realtime_count: cfg.show_realtime_count,
    show_ai_score: cfg.show_ai_score,
    banner_url: (event as unknown as { banner_url?: string | null }).banner_url ?? null,
  }

  return (
    <VoteClient
      eventId={eventId}
      userId={session?.userId ?? null}
      initialEvent={eventInfo}
      initialProjects={projects as Parameters<typeof VoteClient>[0]['initialProjects']}
      initialVoteCounts={voteCounts}
      initialMyVotes={initialMyVotes}
      tracks={eventTracks}
    />
  )
}
