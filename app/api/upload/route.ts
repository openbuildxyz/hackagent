import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

const ALLOWED_BUCKETS = ['event-banners', 'project-logos']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

// 严格白名单：只允许 PNG / JPG / WEBP / GIF。
// 明确禁止 SVG（可执行脚本，Stored XSS 风险）以及其他任何 image/* 子类型。
// 用 magic bytes 检测，不信任客户端 Content-Type 和 filename。
type ImageKind = 'png' | 'jpg' | 'webp' | 'gif'

const MIME_BY_KIND: Record<ImageKind, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

function detectImageKind(buf: Uint8Array): ImageKind | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'png'
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  // GIF: "GIF87a" / "GIF89a"
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61
  ) return 'gif'
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'webp'
  return null
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const bucket = form.get('bucket') as string | null

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (!bucket || !ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  // 基于文件真实内容（magic bytes）判定类型，忽略客户端 Content-Type 与 filename。
  // 这样伪造 Content-Type: image/png 上传 SVG/HTML 也会被直接拒绝。
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const kind = detectImageKind(head)
  if (!kind) {
    return NextResponse.json(
      { error: 'Only PNG / JPG / WEBP / GIF images are allowed' },
      { status: 400 },
    )
  }

  const mime = MIME_BY_KIND[kind]
  const ext = kind
  // 服务端生成文件名，绝不回显客户端传入的文件名（防 .svg / .html 绕过）
  const filename = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const supabase = createServiceClient()
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filename, file, {
      upsert: true,
      // 显式指定 Content-Type，避免存储层从文件名/上传 header 推断出 image/svg+xml 等危险类型
      contentType: mime,
    })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filename)
  return NextResponse.json({ url: publicUrl })
}
