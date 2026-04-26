import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

type Params = { params: Promise<{ eventId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { eventId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data: event, error } = await supabase
    .from('events')
    .select('id, user_id, public_vote')
    .eq('id', eventId)
    .single()

  if (error || !event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (event.user_id !== user.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ public_vote: event.public_vote ?? null })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { eventId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data: event, error: fetchErr } = await supabase
    .from('events')
    .select('id, user_id')
    .eq('id', eventId)
    .single()

  if (fetchErr || !event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (event.user_id !== user.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { error: updateErr } = await supabase
    .from('events')
    .update({ public_vote: body.public_vote })
    .eq('id', eventId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
