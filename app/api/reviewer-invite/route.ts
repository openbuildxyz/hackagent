import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/reviewer-invite?token=xxx — fetch invite info
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: '无效的邀请链接' }, { status: 400 })

  const db = createServiceClient()

  const { data: invite } = await db
    .from('event_reviewers')
    .select('id, invite_email, invite_status, event_id, invited_by, events(name), users!event_reviewers_invited_by_fkey(name)')
    .eq('invite_token', token)
    .single()

  if (!invite) return NextResponse.json({ error: '邀请链接无效或已过期' }, { status: 404 })

  const event = invite.events as unknown as { name: string } | null
  const inviter = invite.users as unknown as { name?: string } | null

  if (invite.invite_status === 'accepted') {
    return NextResponse.json({ already_accepted: true, event_name: event?.name ?? '' })
  }

  return NextResponse.json({
    event_name: event?.name ?? '',
    invite_email: invite.invite_email ?? '',
    inviter_name: inviter?.name ?? '',
    already_accepted: false,
  })
}
