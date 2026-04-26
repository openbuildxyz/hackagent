import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'

const MAX_GENERATIONS_PER_EVENT = 3
const MODEL = process.env.ZENMUX_IMAGE_MODEL || 'google/gemini-3-pro-image-preview'

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

  // Quota check (column added by migration 031; if missing, treat as 0)
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
    'High quality, professional, 1792x1024 pixels.',
  ]
    .filter(Boolean)
    .join('\n')

  const rawApiUrl = process.env.ZENMUX_API_URL || process.env.COMMONSTACK_API_URL || 'https://zenmux.ai/api'
  const apiKey = process.env.ZENMUX_API_KEY || process.env.COMMONSTACK_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
  }

  // Zenmux Vertex AI proxy: generateContent with IMAGE response modality.
  // NOTE: Zenmux's OpenAI-compatible /chat/completions endpoint does NOT
  // support image output for any listed model (verified via /v1/models —
  // zero entries have output_modalities:['image']). The Vertex proxy is the
  // only working path for gemini-3-pro-image-preview.
  const vertexBase = rawApiUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '')
  const url = `${vertexBase}/vertex-ai/v1/models/${MODEL}:generateContent`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[generate-banner] zenmux error', res.status, errText.slice(0, 500))
    return NextResponse.json(
      { error: 'image_generation_failed', message: `AI 生成失败 (${res.status})`, detail: errText.slice(0, 200) },
      { status: 502 }
    )
  }

  const json = await res.json()
  // Extract first inline image from Vertex candidates[0].content.parts[].inlineData
  type Part = {
    text?: string
    thought?: boolean
    inlineData?: { mimeType?: string; data?: string }
    inline_data?: { mime_type?: string; data?: string }
  }
  const parts: Part[] = json?.candidates?.[0]?.content?.parts ?? []
  let b64: string | undefined
  let mime = 'image/png'
  for (const p of parts) {
    const inline = (p.inlineData || p.inline_data) as
      | { mimeType?: string; mime_type?: string; data?: string }
      | undefined
    if (inline?.data) {
      b64 = inline.data
      mime = inline.mimeType || inline.mime_type || mime
      break
    }
  }

  if (!b64) {
    console.error('[generate-banner] no image in response', JSON.stringify(json).slice(0, 500))
    return NextResponse.json({ error: 'no_image_returned' }, { status: 502 })
  }

  // Upload to Supabase storage
  const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
  const filename = `ai-generated/${eventId}-${Date.now()}.${ext}`
  const buffer = Buffer.from(b64, 'base64')

  const { error: upErr } = await db.storage
    .from('event-banners')
    .upload(filename, buffer, { upsert: true, contentType: mime })
  if (upErr) {
    return NextResponse.json({ error: 'upload_failed', message: upErr.message }, { status: 500 })
  }

  const { data: { publicUrl } } = db.storage.from('event-banners').getPublicUrl(filename)

  // Increment quota counter (best effort — column might not exist yet in older deployments)
  await db.from('events').update({ banner_gen_count: used + 1 }).eq('id', eventId)

  return NextResponse.json({
    url: publicUrl,
    used: used + 1,
    quota: MAX_GENERATIONS_PER_EVENT,
  })
}
