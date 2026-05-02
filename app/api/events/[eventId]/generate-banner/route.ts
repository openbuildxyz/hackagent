import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUserWithRole } from '@/lib/session'
import { getZenmuxApiKey, getZenmuxVertexApiBase } from '@/lib/zenmux'

const MAX_GENERATIONS_PER_EVENT = 3
const MODEL = process.env.ZENMUX_IMAGE_MODEL || 'openai/gpt-image-2'
const IMAGE_SIZE = process.env.ZENMUX_IMAGE_SIZE || '1536x864'
const IMAGE_QUALITY = process.env.ZENMUX_IMAGE_QUALITY || 'high'

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
    `High quality, professional, ${IMAGE_SIZE} pixels.`,
  ]
    .filter(Boolean)
    .join('\n')

  const apiKey = getZenmuxApiKey()
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
  }

  // GPT Image 2 is exposed by ZenMux through the Vertex-compatible predict API.
  // Direct handle verified before implementation: openai/gpt-image-2.
  const vertexBase = getZenmuxVertexApiBase()
  const [publisher, modelName] = MODEL.split('/')
  if (!publisher || !modelName) {
    return NextResponse.json({ error: 'invalid_image_model', message: `Invalid image model: ${MODEL}` }, { status: 500 })
  }
  const url = `${vertexBase}/v1/publishers/${publisher}/models/${modelName}:predict`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ prompt: promptText }],
      parameters: {
        sampleCount: 1,
        outputOptions: { mimeType: 'image/png' },
      },
      imageSize: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[generate-banner] zenmux image error', res.status, errText.slice(0, 500))
    return NextResponse.json(
      { error: 'image_generation_failed', message: `AI 生成失败 (${res.status})`, detail: errText.slice(0, 200) },
      { status: 502 }
    )
  }

  const json = await res.json()
  type Prediction = {
    bytesBase64Encoded?: string
    mimeType?: string
    image?: { imageBytes?: string; mimeType?: string }
  }
  const predictions: Prediction[] = json?.predictions ?? json?.generatedImages ?? []
  const first = predictions[0]
  const b64 = first?.bytesBase64Encoded || first?.image?.imageBytes
  const mime = first?.mimeType || first?.image?.mimeType || 'image/png'

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
