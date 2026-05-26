import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

const MAX_GENERATIONS_PER_EVENT = 3
const POE_API_BASE = (process.env.POE_API_URL || 'https://api.poe.com/v1').replace(/\/+$/, '')
const MODEL = process.env.POE_IMAGE_MODEL || 'gpt-image-2'
const IMAGE_SIZE = process.env.POE_IMAGE_SIZE || '1536x864'

// Poe image bots can take ~100s; allow headroom for generation + download + upload.
export const maxDuration = 240

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionUserWithRole()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params
  const db = createServiceClient()

  // Authorize: owner or admin
  const eventQuery = db.from('events').select('*').eq('id', eventId).is('deleted_at', null)
  const { data: event, error: evErr } = await eventQuery.maybeSingle()
  if (evErr || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  if (!session.isAdmin && event.user_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Quota check (column added by migration 031). Do not silently treat a missing
  // column as 0; that burns image credits and never persists quota usage.
  if (!Object.prototype.hasOwnProperty.call(event, 'banner_gen_count')) {
    console.error('[generate-banner] missing events.banner_gen_count column')
    return NextResponse.json(
      { error: 'schema_missing', message: 'events.banner_gen_count is missing; run migration 031_event_banner_gen_count.sql' },
      { status: 500 }
    )
  }
  const used = (event as { banner_gen_count?: number | null }).banner_gen_count ?? 0
  if (used >= MAX_GENERATIONS_PER_EVENT) {
    return NextResponse.json(
      { error: 'quota_exceeded', message: `每个活动最多生成 ${MAX_GENERATIONS_PER_EVENT} 张 banner` },
      { status: 429 }
    )
  }

  // Parse body
  const body = await req.json().catch(() => ({}))
  const userPrompt: string = (body?.prompt ?? '').trim()

  // Build a banner-shaped prompt. Hackathons need clean tech aesthetics.
  const eventTitle = event.title || event.name || 'Hackathon'
  const eventDesc = (event.description ?? '').slice(0, 400)
  const promptText = [
    `Design a wide horizontal banner image (16:9 aspect ratio) for a hackathon event titled "${eventTitle}".`,
    eventDesc ? `Event context: ${eventDesc}` : '',
    userPrompt ? `Creative direction from organizer: ${userPrompt}` : '',
    'Style: modern tech aesthetic, vibrant gradients, abstract geometric shapes, clean typography space on the left, no text rendered in the image.',
    `High quality, professional, ${IMAGE_SIZE} pixels.`,
  ]
    .filter(Boolean)
    .join('\n')

  const apiKey = process.env.POE_API_KEY || ''
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
  }

  // Poe OpenAI-compatible API: image bots return the result as a markdown image
  // link (and a raw URL) in the assistant message content. stream:false per Poe.
  const res = await fetch(`${POE_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [{ role: 'user', content: promptText }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[generate-banner] poe image error', res.status, errText.slice(0, 500))
    return NextResponse.json(
      { error: 'image_generation_failed', message: `AI 生成失败 (${res.status})`, detail: errText.slice(0, 200) },
      { status: 502 }
    )
  }

  const json = await res.json()
  const content: string = json?.choices?.[0]?.message?.content ?? ''
  const imageUrl =
    content.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/)?.[1] ||
    content.match(/https?:\/\/\S+/)?.[0] ||
    ''
  if (!imageUrl) {
    console.error('[generate-banner] no image url in response', content.slice(0, 500))
    return NextResponse.json({ error: 'no_image_returned' }, { status: 502 })
  }

  // Download the generated image so we host it on our own storage.
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) {
    return NextResponse.json({ error: 'image_fetch_failed', message: `下载生成图失败 (${imgRes.status})` }, { status: 502 })
  }
  const mime = imgRes.headers.get('content-type') || 'image/png'
  const buffer = Buffer.from(await imgRes.arrayBuffer())

  // Upload to Supabase storage
  const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
  const filename = `ai-generated/${eventId}-${Date.now()}.${ext}`

  const { error: upErr } = await db.storage
    .from('event-banners')
    .upload(filename, buffer, { upsert: true, contentType: mime })
  if (upErr) {
    return NextResponse.json({ error: 'upload_failed', message: upErr.message }, { status: 500 })
  }

  const { data: { publicUrl } } = db.storage.from('event-banners').getPublicUrl(filename)

  // Increment quota counter. This must be enforced, otherwise the UI can keep
  // showing 3 remaining and the backend can generate unlimited images.
  const { error: quotaErr } = await db
    .from('events')
    .update({ banner_gen_count: used + 1 })
    .eq('id', eventId)
  if (quotaErr) {
    console.error('[generate-banner] quota update failed', quotaErr)
    // Best-effort cleanup: avoid leaving an orphaned paid generation that the
    // user cannot account for or quota-track.
    await db.storage.from('event-banners').remove([filename]).catch(() => {})
    return NextResponse.json(
      { error: 'quota_update_failed', message: 'Banner generated but quota update failed; please retry after the database schema is fixed.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    url: publicUrl,
    used: used + 1,
    quota: MAX_GENERATIONS_PER_EVENT,
  })
}
