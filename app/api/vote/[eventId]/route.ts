import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

type Params = { params: Promise<{ eventId: string }> }

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

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const userId = session.userId

  const supabase = createServiceClient()

  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, name, description, public_vote')
    .eq('id', eventId)
    .single()

  if (eventErr || !event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cfg = event.public_vote as PublicVoteConfig | null
  if (!cfg?.enabled) return NextResponse.json({ error: 'Voting not enabled' }, { status: 403 })

  // Fetch projects
  const { data: allProjects } = await supabase
    .from('projects')
    .select('id, name, team_name, description, demo_url, github_url, tags')
    .eq('event_id', eventId)
    .is('deleted_at', null)

  const projects = (allProjects ?? []).map((p) => {
    const out: Record<string, unknown> = { id: p.id, name: p.name, team_name: p.team_name }
    const vf = cfg.visible_fields ?? []
    if (vf.includes('description')) out.description = p.description
    if (vf.includes('demo_url')) out.demo_url = p.demo_url
    if (vf.includes('github_url')) out.github_url = p.github_url
    if (vf.includes('tags')) out.tags = p.tags
    return out
  })

  // Vote counts (if realtime enabled)
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

  // User's existing votes
  const { data: votes } = await supabase
    .from('public_votes')
    .select('project_id')
    .eq('event_id', eventId)
    .eq('voter_user_id', userId)
  const myVotes = (votes ?? []).map((v) => v.project_id)

  return NextResponse.json({
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      title: cfg.title || event.name,
      vote_config_description: cfg.description,
      vote_limit: cfg.vote_limit,
      ends_at: cfg.ends_at,
      show_realtime_count: cfg.show_realtime_count,
      show_ai_score: cfg.show_ai_score,
    },
    projects,
    vote_counts: voteCounts,
    my_votes: myVotes,
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const userId = session.userId
  const body = await req.json()
  const { project_id } = body as { project_id: string }

  if (!project_id) {
    return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, public_vote')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cfg = event.public_vote as PublicVoteConfig | null
  if (!cfg?.enabled) return NextResponse.json({ error: 'Voting not enabled' }, { status: 403 })

  if (cfg.ends_at && new Date(cfg.ends_at) < new Date()) {
    return NextResponse.json({ error: 'Voting has ended' }, { status: 400 })
  }

  // Check vote limit
  const { data: existing } = await supabase
    .from('public_votes')
    .select('project_id')
    .eq('event_id', eventId)
    .eq('voter_user_id', userId)

  const myVotes = (existing ?? []).map((v) => v.project_id)

  if (myVotes.includes(project_id)) {
    return NextResponse.json({ error: 'Already voted for this project' }, { status: 400 })
  }

  if (myVotes.length >= (cfg.vote_limit ?? 1)) {
    return NextResponse.json({ error: 'Vote limit reached' }, { status: 400 })
  }

  // Scope check: project_id must belong to this event. Without this, a voter
  // could submit a project_id from another event; the insert would succeed and
  // count against the wrong event's tally.
  const { data: targetProject } = await supabase
    .from('projects')
    .select('id, event_id')
    .eq('id', project_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!targetProject || targetProject.event_id !== eventId) {
    return NextResponse.json({ error: 'Project not in this event' }, { status: 403 })
  }

  // Prevent voting for own project (via registration link)
  const { data: ownReg } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single()
  if (ownReg) {
    const { data: ownProject } = await supabase
      .from('projects')
      .select('id')
      .eq('registration_id', ownReg.id)
      .eq('id', project_id)
      .single()
    if (ownProject) {
      return NextResponse.json({ error: '不能给自己的项目投票' }, { status: 400 })
    }
  }

  const { error: insertErr } = await supabase
    .from('public_votes')
    .insert({ event_id: eventId, project_id, voter_user_id: userId, voter_fingerprint: userId })

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: 'Already voted for this project' }, { status: 400 })
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const newMyVotes = [...myVotes, project_id]
  return NextResponse.json({ my_votes: newMyVotes, votes_remaining: (cfg.vote_limit ?? 1) - newMyVotes.length })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const userId = session.userId
  const body = await req.json()
  const { project_id } = body as { project_id: string }

  if (!project_id) {
    return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, public_vote')
    .eq('id', eventId)
    .single()

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cfg = event.public_vote as PublicVoteConfig | null
  if (!cfg?.enabled) return NextResponse.json({ error: 'Voting not enabled' }, { status: 403 })

  if (cfg.ends_at && new Date(cfg.ends_at) < new Date()) {
    return NextResponse.json({ error: 'Voting has ended' }, { status: 400 })
  }

  const { error: delErr } = await supabase
    .from('public_votes')
    .delete()
    .eq('event_id', eventId)
    .eq('project_id', project_id)
    .eq('voter_user_id', userId)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Return updated my_votes
  const { data: remaining } = await supabase
    .from('public_votes')
    .select('project_id')
    .eq('event_id', eventId)
    .eq('voter_user_id', userId)

  const myVotes = (remaining ?? []).map((v) => v.project_id)
  return NextResponse.json({ my_votes: myVotes, votes_remaining: (cfg.vote_limit ?? 1) - myVotes.length })
}
