import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'
import { recordAdminAction } from '@/lib/admin-audit'

// PATCH — event owner or admin: approve or reject a registration
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; regId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId, regId } = await params
  const db = createServiceClient()

  // OPE-25: admin bypass — 任意活动可改报名；否则必须是 owner
  const { data: event } = await db
    .from('events')
    .select('id, user_id')
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  const isOwner = event.user_id === session.userId
  if (!isOwner && !session.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { action, reject_reason } = body as { action: 'approve' | 'reject'; reject_reason?: string }

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Fetch the registration
  const { data: reg } = await db
    .from('registrations')
    .select('*')
    .eq('id', regId)
    .eq('event_id', eventId)
    .single()

  if (!reg) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
  }

  if (action === 'reject') {
    const { error } = await db
      .from('registrations')
      .update({ status: 'rejected', reject_reason: reject_reason ?? null })
      .eq('id', regId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (session.isAdmin && !isOwner) {
      await recordAdminAction({
        adminUserId: session.userId,
        action: 'registration.reject',
        target_type: 'registration',
        target_id: regId,
        before: { status: reg.status },
        after: { status: 'rejected', reject_reason: reject_reason ?? null },
        metadata: { event_id: eventId, owner_user_id: event.user_id },
      })
    }
    return NextResponse.json({ success: true, status: 'rejected' })
  }

  // approve
  const { error: updateErr } = await db
    .from('registrations')
    .update({ status: 'approved' })
    .eq('id', regId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Create project if not already linked
  if (!reg.project_id) {
    const { data: project, error: projErr } = await db
      .from('projects')
      .insert({
        event_id: eventId,
        name: reg.team_name ?? 'Unnamed',
        github_url: reg.github_url ?? null,
        track_ids: [],
        extra_fields: reg.extra_fields ?? {},
        status: 'pending',
      })
      .select('id')
      .single()

    if (!projErr && project) {
      await db.from('registrations').update({ project_id: project.id }).eq('id', regId)

      // Trigger pre-analysis
      await fetch(`${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/events/${eventId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_SECRET ?? '' },
        body: JSON.stringify({ project_id: project.id }),
      }).catch(() => {/* fire and forget */})
    }
  }

  if (session.isAdmin && !isOwner) {
    await recordAdminAction({
      adminUserId: session.userId,
      action: 'registration.approve',
      target_type: 'registration',
      target_id: regId,
      before: { status: reg.status },
      after: { status: 'approved' },
      metadata: { event_id: eventId, owner_user_id: event.user_id },
    })
  }

  return NextResponse.json({ success: true, status: 'approved' })
}
