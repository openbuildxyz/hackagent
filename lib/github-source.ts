import { createHash } from 'node:crypto'
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

export type GithubReference = { owner: string; repo: string; refCandidates: string[]; url: string }
export type SourceFile = { path: string; type: string; size: number; content: string }
export type GithubSnapshot = {
  reference: GithubReference
  ref: string
  digest: string
  files: SourceFile[]
  metadata: Record<string, unknown>
}

export function parseGithubReference(value: string): GithubReference | null {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname.toLowerCase() !== 'github.com') return null
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts.length < 2 || !/^[\w.-]+$/.test(parts[0]) || !/^[\w.-]+$/.test(parts[1])) return null
    const repo = parts[1].replace(/\.git$/i, '')
    const refs = ['tree', 'blob', 'commit'].includes(parts[2]) ? parts.slice(3) : []
    if (['tree', 'blob', 'commit'].includes(parts[2]) && !refs.length) return null
    return {
      owner: parts[0], repo,
      refCandidates: refs.length ? refs.map((_, i) => refs.slice(0, refs.length - i).join('/')) : ['HEAD'],
      url: value,
    }
  } catch { return null }
}

export function redactError(message: string): string {
  return Object.entries(process.env)
    .filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/.test(key) && value && value.length > 8)
    .reduce((text, [, value]) => text.split(value!).join('[redacted]'), message)
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .slice(0, 2000)
}

export class HttpServiceError extends Error {
  constructor(public status: number, message: string, public retryAfterMs = 0) {
    super(message)
    this.name = 'HttpServiceError'
  }
}

export async function serviceError(response: Response, service: string) {
  const body = redactError(await response.text())
  const retryAfter = Number(response.headers.get('retry-after'))
  return new HttpServiceError(response.status,
    `${service} HTTP ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`,
    Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5000) : 0)
}

export function isRetryableError(error: unknown) {
  return !(error instanceof HttpServiceError) || [408, 425, 429, 500, 502, 503, 504].includes(error.status)
}

async function readArchiveStream(response: Response): Promise<{ files: SourceFile[]; digest: string }> {
  if (!response.body) throw new Error('GitHub archive has no response body')
  const input = Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>)
  const unzip = createGunzip()
  const digest = createHash('sha256')
  const files: SourceFile[] = []
  let compressedBytes = 0
  let expandedBytes = 0
  let header = Buffer.alloc(0)
  let remaining = 0
  let padding = 0
  let entry: { path: string; size: number; type: string; chunks: Buffer[]; capture: boolean } | null = null
  let nextName: string | undefined
  const finish = () => {
    if (!entry) return
    const content = entry.capture ? Buffer.concat(entry.chunks).toString('utf8') : ''
    if (entry.type === 'L') nextName = content.split('\0')[0].trim()
    else if (entry.type === 'x') {
      for (const line of content.split('\n')) { const match = line.match(/^\d+ path=(.*)$/); if (match) nextName = match[1] }
    } else if ((entry.type === '0' || entry.type === '') && entry.path && entry.size > 0) {
      files.push({ path: entry.path, type: 'blob', size: entry.size, content })
    }
    entry = null
  }
  input.on('data', (chunk: Buffer) => {
    compressedBytes += chunk.length
    if (compressedBytes > 256 * 1024 * 1024) input.destroy(new Error('GitHub archive exceeds the compressed size limit'))
  })
  input.on('error', error => unzip.destroy(error))
  input.pipe(unzip)
  try {
    for await (const chunk of unzip) {
      const bytes = chunk as Buffer
      expandedBytes += bytes.length
      if (expandedBytes > 1024 * 1024 * 1024) throw new Error('GitHub archive exceeds the expanded size limit')
      digest.update(bytes)
      let offset = 0
      while (offset < bytes.length) {
        if (remaining > 0) {
          const length = Math.min(remaining, bytes.length - offset)
          if (entry?.capture) entry.chunks.push(bytes.subarray(offset, offset + length))
          remaining -= length; offset += length
          if (remaining === 0) finish()
        } else if (padding > 0) {
          const length = Math.min(padding, bytes.length - offset)
          padding -= length; offset += length
        } else {
          const length = Math.min(512 - header.length, bytes.length - offset)
          header = Buffer.concat([header, bytes.subarray(offset, offset + length)])
          offset += length
          if (header.length < 512) continue
          if (header.every(byte => byte === 0)) { header = Buffer.alloc(0); continue }
          const text = (start: number, size: number) => header.subarray(start, start + size).toString().split('\0')[0]
          const size = Number.parseInt(text(124, 12).trim() || '0', 8)
          if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid GitHub tar archive')
          const type = text(156, 1)
          const fullPath = nextName || [text(345, 155), text(0, 100)].filter(Boolean).join('/')
          nextName = undefined
          const path = fullPath.split('/').slice(1).join('/')
          const safe = path && !path.split('/').includes('..')
          // Large images/assets are streamed past; only text needed by the review is retained.
          const readable = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|c|cpp|h|cs|rb|php|vue|svelte|sol|move|html|css|dart|ex|exs|md|txt)$/i.test(path)
          entry = { path: safe ? path : '', size, type, chunks: [],
            capture: size <= 2_000_000 && (type === 'L' || type === 'x' || Boolean(safe && readable)) }
          remaining = size; padding = (512 - size % 512) % 512
          header = Buffer.alloc(0)
          if (!remaining) finish()
        }
      }
    }
    if (remaining || header.length || padding) throw new Error('Truncated GitHub tar archive')
    return { files, digest: digest.digest('hex') }
  } finally { input.destroy(); unzip.destroy() }
}

// Parse in memory: archive paths are never written to the filesystem.
export function readTarSource(buffer: Buffer): SourceFile[] {
  const files: SourceFile[] = []
  let nextName: string | undefined
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const text = (start: number, size: number) => header.subarray(start, start + size).toString().split('\0')[0]
    const size = Number.parseInt(text(124, 12).trim() || '0', 8)
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > buffer.length) throw new Error('Invalid GitHub tar archive')
    const type = text(156, 1)
    const body = buffer.subarray(offset + 512, offset + 512 + size)
    let name = nextName || [text(345, 155), text(0, 100)].filter(Boolean).join('/')
    nextName = undefined
    if (type === 'L') nextName = body.toString().split('\0')[0].trim()
    else if (type === 'x') {
      const pax = body.toString()
      for (const entry of pax.split('\n')) {
        const match = entry.match(/^\d+ path=(.*)$/)
        if (match) nextName = match[1]
      }
    } else if (type === '0' || type === '') {
      name = name.split('/').slice(1).join('/')
      if (name && !name.split('/').includes('..') && size > 0 && size <= 2_000_000) {
        files.push({ path: name, type: 'blob', size, content: body.toString('utf8') })
      }
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

export async function loadGithubSnapshot(reference: GithubReference): Promise<GithubSnapshot> {
  let lastError: unknown
  for (const ref of reference.refCandidates) {
    const token = process.env.GITHUB_TOKEN
    const url = token
      ? `https://api.github.com/repos/${reference.owner}/${reference.repo}/tarball/${encodeURIComponent(ref)}`
      : `https://codeload.github.com/${reference.owner}/${reference.repo}/tar.gz/${encodeURIComponent(ref)}`
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'HackAgent/1.0', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
        if (!response.ok) throw await serviceError(response, 'GitHub archive')
        const { files: archiveFiles, digest } = await readArchiveStream(response)
        const submitted = reference.refCandidates[0]
        const scope = submitted !== 'HEAD' && submitted.startsWith(ref + '/') ? submitted.slice(ref.length + 1) : null
        const files = scope ? archiveFiles.filter(file => file.path === scope || file.path.startsWith(scope + '/')) : archiveFiles
        if (!files.length) throw new Error('GitHub archive contains no readable source files')
        const metadata: Record<string, unknown> = { source_scope: scope }
        // Metadata is auxiliary; a rate-limited API must not suppress available source code.
        try {
          const token = process.env.GITHUB_TOKEN
          const response = await fetch(`https://api.github.com/repos/${reference.owner}/${reference.repo}`, {
            signal: AbortSignal.timeout(1500),
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'HackAgent/1.0', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          })
          if (response.ok) Object.assign(metadata, await response.json())
          else metadata.metadata_error = (await serviceError(response, 'GitHub metadata')).message
        } catch (error) { metadata.metadata_error = redactError(String(error)) }
        return { reference, ref, digest, files, metadata }
      } catch (error) {
        lastError = error
        if (error instanceof HttpServiceError && error.status === 404) break
        if (!isRetryableError(error) || attempt === 2) throw error
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 4000)))
      }
    }
  }
  throw lastError || new Error('GitHub repository/ref could not be resolved')
}
