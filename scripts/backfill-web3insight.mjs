#!/usr/bin/env node
/**
 * Backfill HackAgent Web3Insight analysis for projects that missed Web3 data.
 *
 * Safe by default:
 * - Selects projects where web3_analysis is null OR last web3_status was an error/not_run.
 * - Preserves existing GitHub/Sonar/AI review data.
 * - Updates only web3_analysis, analysis_result.web3_analysis, analysis_log.
 *
 * Usage:
 *   DRY_RUN=1 EVENT_ID=<uuid> keyrail run -- node scripts/backfill-web3insight.mjs
 *   EVENT_ID=<uuid> LIMIT=50 keyrail run -- node scripts/backfill-web3insight.mjs
 *   EVENT_ID=<uuid> PROJECT_IDS=id1,id2 keyrail run -- node scripts/backfill-web3insight.mjs
 */

import { createClient } from '@supabase/supabase-js'

const WEB3INSIGHT_BASE = 'https://api.web3insight.ai/v1'
const GITHUB_API = 'https://api.github.com'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const WEB3INSIGHT_TOKEN = process.env.WEB3INSIGHT_TOKEN
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

const EVENT_ID = process.env.EVENT_ID
const LIMIT = Number.parseInt(process.env.LIMIT || '1000', 10)
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const PROJECT_IDS = (process.env.PROJECT_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.CONCURRENCY || '3', 10))

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY')
}
if (!WEB3INSIGHT_TOKEN) {
  throw new Error('Missing WEB3INSIGHT_TOKEN')
}
if (!EVENT_ID && PROJECT_IDS.length === 0) {
  throw new Error('Set EVENT_ID=<uuid> or PROJECT_IDS=id1,id2')
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`
  return headers
}

function parseGithubUrl(url) {
  if (!url) return null
  const match = String(url).match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)(?:[\s#?]|$)/i)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/i, '').replace(/\/$/, '') }
}

function extractTwitterHandle(text) {
  const source = String(text || '')
  const postMatch = source.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,50})\/status\//)
  if (postMatch) return postMatch[1]
  const profileMatch = source.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,50})(?:[/?#]|$)/)
  if (profileMatch) {
    const handle = profileMatch[1]
    if (!['home', 'i', 'intent', 'share', 'explore', 'search'].includes(handle.toLowerCase())) return handle
  }
  const atMatch = source.match(/@([A-Za-z0-9_]{3,50})/)
  if (atMatch) return atMatch[1]
  return null
}

async function getOwnerType(owner) {
  try {
    const res = await fetch(`${GITHUB_API}/users/${owner}`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return 'User'
    const data = await res.json()
    return data?.type === 'Organization' ? 'Organization' : 'User'
  } catch {
    return 'User'
  }
}

async function getRepoContributors(owner, repo) {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=30&anon=0`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.filter(c => c.type === 'User').map(c => c.login).filter(Boolean)
  } catch {
    return []
  }
}

async function getRepoCommitAuthors(owner, repo) {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits?per_page=30`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const commits = await res.json()
    return [...new Set(commits.map(c => c.author?.login).filter(Boolean))]
  } catch {
    return []
  }
}

async function fetchWeb3InsightUser(username) {
  const empty = {
    total_score: 0,
    ecosystems: [],
    top_ecosystem: null,
    is_web3_developer: false,
    repo_count: 0,
    username,
  }

  try {
    const res = await fetch(`${WEB3INSIGHT_BASE}/external/github/users/username/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${WEB3INSIGHT_TOKEN}` },
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      let code = null
      let message = `HTTP ${res.status}`
      try {
        const err = await res.json()
        code = typeof err.code === 'string' ? err.code : null
        message = typeof err.message === 'string' ? err.message : message
      } catch {
        try {
          const text = await res.text()
          if (text) message = text.slice(0, 300)
        } catch { /* ignore */ }
      }
      return {
        ...empty,
        error: {
          provider: 'web3insight',
          status: res.status,
          code,
          message,
          retryable: res.status >= 500 || res.status === 429,
        },
      }
    }

    const data = await res.json()
    const ecosystemsRaw = data?.eco_score?.ecosystems ?? []
    const ecosystems = []
    let totalScore = 0

    for (const eco of ecosystemsRaw) {
      let ecoName = eco.ecosystem
      if (typeof ecoName === 'object' && ecoName !== null) ecoName = ecoName.name ?? ''
      const repos = eco.repos ?? []
      const ecoTotal = eco.total_score ?? repos.reduce((s, r) => s + (r.score ?? 0), 0)
      totalScore += ecoTotal
      ecosystems.push({
        name: ecoName,
        score: ecoTotal,
        repo_count: repos.length,
        top_repos: repos.slice(0, 3).map(r => r.repo_name ?? ''),
      })
    }

    ecosystems.sort((a, b) => b.score - a.score)
    return {
      total_score: totalScore,
      ecosystems,
      top_ecosystem: ecosystems[0]?.name ?? null,
      is_web3_developer: ecosystems.length > 0,
      repo_count: ecosystems.reduce((s, e) => s + e.repo_count, 0),
      username,
    }
  } catch (err) {
    return {
      ...empty,
      error: {
        provider: 'web3insight',
        status: null,
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      },
    }
  }
}

async function analyzeProjectWeb3(project) {
  const parsed = parseGithubUrl(project.github_url)
  if (!parsed) return null

  const extraFields = project.extra_fields && typeof project.extra_fields === 'object'
    ? Object.values(project.extra_fields).join(' ')
    : ''
  const extraText = [project.description, project.demo_url, extraFields].filter(Boolean).join(' ')
  const twitterHandle = extractTwitterHandle(extraText)

  const ownerType = await getOwnerType(parsed.owner)
  let usernamesToCheck = []
  if (ownerType === 'Organization') {
    usernamesToCheck = await getRepoContributors(parsed.owner, parsed.repo)
    if (!usernamesToCheck.length) usernamesToCheck = await getRepoCommitAuthors(parsed.owner, parsed.repo)
    usernamesToCheck = usernamesToCheck.slice(0, usernamesToCheck.length > 20 ? 20 : 10)
  } else {
    usernamesToCheck = [parsed.owner]
  }

  const results = await Promise.all(usernamesToCheck.slice(0, 30).map(u => fetchWeb3InsightUser(u)))
  const web3Errors = results
    .filter(r => r.error)
    .map(r => ({
      provider: 'web3insight',
      username: r.username,
      status: r.error?.status ?? null,
      code: r.error?.code ?? null,
      message: r.error?.message ?? 'Unknown error',
      retryable: r.error?.retryable,
    }))

  const ecoMap = new Map()
  for (const r of results) {
    for (const eco of r.ecosystems) {
      const existing = ecoMap.get(eco.name)
      if (existing) {
        existing.score += eco.score
        existing.repo_count += eco.repo_count
        existing.top_repos = [...new Set([...existing.top_repos, ...eco.top_repos])].slice(0, 3)
      } else {
        ecoMap.set(eco.name, { ...eco })
      }
    }
  }
  const mergedEcosystems = [...ecoMap.values()].sort((a, b) => b.score - a.score)

  return {
    web3insight: {
      total_score: results.reduce((s, r) => s + r.total_score, 0),
      ecosystems: mergedEcosystems.slice(0, 8),
      top_ecosystem: mergedEcosystems[0]?.name ?? null,
      is_web3_developer: results.some(r => r.is_web3_developer),
      repo_count: results.reduce((s, r) => s + r.repo_count, 0),
      status: web3Errors.length === 0 ? 'ok' : web3Errors.length === results.length ? 'error' : 'partial_error',
      errors: web3Errors,
    },
    contributors: results.map(r => ({
      username: r.username,
      web3_score: r.total_score,
      is_web3_dev: r.is_web3_developer,
      top_eco: r.top_ecosystem,
    })),
    github_username: parsed.owner,
    twitter: twitterHandle ? { handle: twitterHandle } : null,
    analyzed_at: new Date().toISOString(),
  }
}

function needsWeb3(project) {
  if (!project.github_url) return false
  const top = project.web3_analysis
  const nested = project.analysis_result?.web3_analysis
  const existing = top || nested
  const status = existing?.web3insight?.status
  if (!existing) return true
  if (['error', 'partial_error', 'not_run'].includes(status)) return true
  return false
}

async function loadProjects() {
  let query = db
    .from('projects')
    .select('id,name,github_url,demo_url,description,extra_fields,web3_analysis,analysis_result,analysis_log')
    .limit(LIMIT)

  if (PROJECT_IDS.length) query = query.in('id', PROJECT_IDS)
  else query = query.eq('event_id', EVENT_ID)

  const { data, error } = await query
  if (error) throw error
  return (data || []).filter(needsWeb3)
}

async function processProject(project) {
  console.log(`→ ${project.name} ${project.id}`)
  const web3Analysis = await analyzeProjectWeb3(project)
  if (!web3Analysis) return { ok: false, status: 'skipped' }

  const status = web3Analysis.web3insight.status
  const errors = web3Analysis.web3insight.errors.length
  console.log(`  web3_status=${status} contributors=${web3Analysis.contributors.length} errors=${errors}`)

  if (DRY_RUN) return { ok: true, dryRun: true, status }

  const existingResult = project.analysis_result && typeof project.analysis_result === 'object' ? project.analysis_result : {}
  const existingLog = Array.isArray(project.analysis_log) ? project.analysis_log : []
  const now = new Date().toISOString()
  const logEntry = {
    ts: now,
    status: status === 'error' ? 'partial_error' : 'completed',
    mode: 'backfill',
    module: 'web3',
    web3: true,
    web3_status: status,
    web3_errors: web3Analysis.web3insight.errors,
  }

  const { error } = await db.from('projects').update({
    web3_analysis: web3Analysis,
    analysis_result: {
      ...existingResult,
      web3_analysis: web3Analysis,
      analyzed_at: existingResult.analyzed_at || now,
    },
    analysis_log: [...existingLog, logEntry],
  }).eq('id', project.id)

  if (error) throw error
  return { ok: true, status }
}

async function main() {
  console.log(`HackAgent Web3Insight backfill | dryRun=${DRY_RUN} event=${EVENT_ID || '-'} projectIds=${PROJECT_IDS.length} limit=${LIMIT}`)
  const projects = await loadProjects()
  console.log(`Found ${projects.length} projects needing Web3 backfill`)
  if (!projects.length) return

  let done = 0
  let failed = 0
  for (let i = 0; i < projects.length; i += CONCURRENCY) {
    const batch = projects.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map(processProject))
    for (const result of results) {
      if (result.status === 'fulfilled') done++
      else {
        failed++
        console.error(`  ❌ ${result.reason?.message || result.reason}`)
      }
    }
    console.log(`Progress ${Math.min(i + batch.length, projects.length)}/${projects.length} | done=${done} failed=${failed}`)
  }

  console.log(`Finished | done=${done} failed=${failed} dryRun=${DRY_RUN}`)
}

main().catch(err => {
  console.error(err.stack || err.message || err)
  process.exit(1)
})
