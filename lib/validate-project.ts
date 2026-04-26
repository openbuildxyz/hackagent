/**
 * Shared validation for project submission inputs.
 * Prevents XSS, javascript: URLs, and oversized strings from entering the DB.
 */

const MAX_NAME = 100
const MAX_URL = 2048
const MAX_DESCRIPTION = 500
const MAX_DEMO_URL = 2048
const MAX_TEAM_NAME = 100

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, '').replace(/&\w+;/g, ' ').trim()
}

function isDangerousUrl(url: string): boolean {
  const lower = url.toLowerCase().trim()
  return lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')
}

function isValidHttpUrl(url: string): boolean {
  if (isDangerousUrl(url)) return false
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export interface ValidationResult {
  ok: boolean
  errors: Record<string, string>
  sanitized: {
    name: string
    github_url: string
    description: string
    demo_url: string | null
    team_name: string | null
  }
}

export function validateProjectInput(input: {
  name?: unknown
  github_url?: unknown
  description?: unknown
  demo_url?: unknown
  team_name?: unknown
}): ValidationResult {
  const errors: Record<string, string> = {}

  // name
  if (typeof input.name !== 'string' || !input.name.trim()) {
    errors.name = 'project_name is required'
  } else {
    const name = stripHtml(input.name.trim())
    if (!name) errors.name = 'project_name cannot be empty after sanitization'
    else if (name.length > MAX_NAME) errors.name = `project_name must be ≤${MAX_NAME} chars`
  }

  // github_url
  if (typeof input.github_url !== 'string' || !input.github_url.trim()) {
    errors.github_url = 'github_url is required'
  } else {
    const url = input.github_url.trim()
    if (isDangerousUrl(url)) errors.github_url = 'github_url must be a valid HTTP(S) URL'
    else if (!isValidHttpUrl(url)) errors.github_url = 'github_url must be a valid HTTP(S) URL'
    else if (url.length > MAX_URL) errors.github_url = `github_url must be ≤${MAX_URL} chars`
  }

  // description
  if (typeof input.description !== 'string' || !input.description.trim()) {
    errors.description = 'description is required'
  } else {
    const desc = input.description.trim()
    if (desc.length > MAX_DESCRIPTION) errors.description = `description must be ≤${MAX_DESCRIPTION} chars`
  }

  // demo_url (optional)
  if (input.demo_url !== undefined && input.demo_url !== null && input.demo_url !== '') {
    if (typeof input.demo_url !== 'string') {
      errors.demo_url = 'demo_url must be a string'
    } else {
      const url = input.demo_url.trim()
      if (url && isDangerousUrl(url)) errors.demo_url = 'demo_url must be a valid HTTP(S) URL'
      else if (url && !isValidHttpUrl(url)) errors.demo_url = 'demo_url must be a valid HTTP(S) URL'
      else if (url.length > MAX_DEMO_URL) errors.demo_url = `demo_url must be ≤${MAX_DEMO_URL} chars`
    }
  }

  // team_name (optional)
  if (input.team_name !== undefined && input.team_name !== null && input.team_name !== '') {
    if (typeof input.team_name !== 'string') {
      errors.team_name = 'team_name must be a string'
    } else {
      const tn = stripHtml(input.team_name.trim())
      if (tn.length > MAX_TEAM_NAME) errors.team_name = `team_name must be ≤${MAX_TEAM_NAME} chars`
    }
  }

  const ok = Object.keys(errors).length === 0
  const sanitized = ok ? {
    name: stripHtml((input.name as string).trim()),
    github_url: (input.github_url as string).trim(),
    description: (input.description as string).trim(),
    demo_url: typeof input.demo_url === 'string' && input.demo_url.trim() ? input.demo_url.trim() : null,
    team_name: typeof input.team_name === 'string' && input.team_name.trim() ? stripHtml(input.team_name.trim()) : null,
  } : { name: '', github_url: '', description: '', demo_url: null, team_name: null }

  return { ok, errors, sanitized }
}
