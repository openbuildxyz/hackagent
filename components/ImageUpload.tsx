'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

interface Props {
  value: string | null
  onChange: (url: string) => void
  bucket: string
  path: string
  label?: string
  aspectRatio?: 'banner' | 'square'
}

/** Compress image to JPEG via Canvas, targeting ≤ maxKB kilobytes */
async function compressImage(file: File, maxKB = 800): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      // Downscale if wider than 2400px
      const MAX_W = 2400
      let { width, height } = img
      if (width > MAX_W) {
        height = Math.round((height * MAX_W) / width)
        width = MAX_W
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      // Try progressively lower quality until under maxKB
      const tryQuality = (q: number) => {
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('Canvas toBlob failed')); return }
          if (blob.size <= maxKB * 1024 || q <= 0.3) {
            resolve(blob)
          } else {
            tryQuality(Math.round((q - 0.1) * 10) / 10)
          }
        }, 'image/jpeg', q)
      }
      tryQuality(0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

export default function ImageUpload({ value, onChange, bucket, path, label, aspectRatio = 'banner' }: Props) {
  const t = useT()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片不能超过 10MB')
      return
    }

    setUploading(true)
    try {
      // Compress before upload to stay well under Vercel's 4.5MB body limit
      const compressed = await compressImage(file)

      const form = new FormData()
      form.append('file', compressed, `upload.jpg`)
      form.append('bucket', bucket)
      form.append('path', path)

      const res = await fetch('/api/upload', { method: 'POST', body: form, credentials: 'include' })

      // Guard against non-JSON responses (e.g. Vercel 413 plain text)
      const ct = res.headers.get('content-type') ?? ''
      let data: { url?: string; error?: string }
      if (ct.includes('application/json')) {
        data = await res.json()
      } else {
        const raw = await res.text()
        throw new Error(`HTTP ${res.status}: ${raw.slice(0, 120)}`)
      }

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      onChange(data.url!)
      toast.success('上传成功')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`上传失败：${msg}`)
    } finally {
      setUploading(false)
    }
  }

  const isSquare = aspectRatio === 'square'
  const containerClass = isSquare ? 'w-24 h-24' : 'w-full aspect-video max-h-40'

  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm font-medium text-fg-muted">{label}</p>}
      <div className="flex items-start gap-3">
        <div
          className={`${containerClass} relative rounded-lg border-2 border-dashed cursor-pointer overflow-hidden transition-colors flex-shrink-0 ${
            dragOver ? 'border-[var(--color-fg)] bg-black/5' : 'border-token hover:border-[var(--color-border-strong)] bg-surface'
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        >
          {value ? (
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-fg-subtle">
              <Upload size={isSquare ? 16 : 18} />
              {!isSquare && <span className="text-xs text-center px-2">{t('upload.drag')}</span>}
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-[var(--color-bg)]/80 flex items-center justify-center">
              <Loader2 size={18} className="animate-spin text-fg-muted" />
            </div>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange('') }}
            className="mt-1 text-fg-subtle hover:text-red-500 transition-colors"
            title="移除图片"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {!isSquare && (
        <p className="text-xs text-fg-subtle">{t('upload.formatHint')}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />
    </div>
  )
}
