import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/session'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const GITHUB_API = 'https://api.github.com'

function githubHeaders() {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'HackAgent/1.0',
  }
  if (GITHUB_TOKEN) h['Authorization'] = `Bearer ${GITHUB_TOKEN}`
  return h
}

function parseGithubUrl(url: string): [string, string] | null {
  if (!url) return null
  const m = url.match(/github\.com[/:]([^/]+)\/([^/\s?#]+)/)
  if (!m) return null
  const repo = m[2].replace(/\.git$/, '').replace(/\/$/, '')
  return [m[1], repo]
}

async function ghGet(path: string): Promise<unknown> {
  // Random delay 500-2000ms to avoid rate limiting
  await new Promise(r => setTimeout(r, 500 + Math.random() * 1500))
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) return null
  return res.json()
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  const db = createServiceClient()

  // Get project
  const { data: project } = await db
    .from('projects')
    .select('id, name, github_url, description, event_id, events(user_id)')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Authorize: event owner OR reviewer of the event
  const eventOwner = (project.events as { user_id?: string } | null)?.user_id
  if (eventOwner !== session.userId) {
    const { data: reviewer } = await db
      .from('event_reviewers')
      .select('id')
      .eq('event_id', project.event_id)
      .eq('user_id', session.userId)
      .single()
    if (!reviewer) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!project.github_url) {
    return NextResponse.json({ error: 'No GitHub URL' }, { status: 400 })
  }

  const parsed = parseGithubUrl(project.github_url)
  if (!parsed) return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 })

  const [owner, repo] = parsed

  // Mark as running
  await db.from('projects').update({ analysis_status: 'running' }).eq('id', projectId)

  try {
    const result = await analyzeGithub(owner, repo)

    await db
      .from('projects')
      .update({ github_analysis: result, analysis_status: 'done' })
      .eq('id', projectId)

    return NextResponse.json({ success: true, analysis: result })
  } catch (err) {
    await db.from('projects').update({ analysis_status: 'error' }).eq('id', projectId)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function analyzeGithub(owner: string, repo: string) {
  // Fetch repo info
  const repoData = await ghGet(`/repos/${owner}/${repo}`) as Record<string, unknown> | null
  if (!repoData) return { error: 'repo_not_found' }

  const result: Record<string, unknown> = {
    stars: repoData.stargazers_count ?? 0,
    forks: repoData.forks_count ?? 0,
    open_issues: repoData.open_issues_count ?? 0,
    size_kb: repoData.size ?? 0,
    is_fork: repoData.fork ?? false,
    created_at: repoData.created_at,
    updated_at: repoData.updated_at,
    description: repoData.description ?? '',
    topics: repoData.topics ?? [],
    default_branch: repoData.default_branch ?? 'main',
  }

  // Parallel fetches with individual delays
  const [languages, contributors, commits, owner_info, tree, codeAlerts, dependabot] = await Promise.all([
    ghGet(`/repos/${owner}/${repo}/languages`),
    ghGet(`/repos/${owner}/${repo}/contributors?per_page=10&anon=1`),
    ghGet(`/repos/${owner}/${repo}/commits?since=${new Date(Date.now() - 30 * 86400000).toISOString()}&per_page=100`),
    ghGet(`/users/${owner}`),
    ghGet(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=0`),
    ghGet(`/repos/${owner}/${repo}/code-scanning/alerts?state=open&per_page=10`).catch(() => null),
    ghGet(`/repos/${owner}/${repo}/vulnerability-alerts`).catch(() => null),
  ])

  // Languages
  if (languages && typeof languages === 'object' && !Array.isArray(languages)) {
    const langs = languages as Record<string, number>
    const total = Object.values(langs).reduce((a, b) => a + b, 0)
    result.languages = Object.fromEntries(
      Object.entries(langs)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([lang, bytes]) => [lang, { bytes, pct: Math.round(bytes / total * 100) }])
    )
  } else {
    result.languages = {}
  }

  // Contributors
  result.contributors_count = Array.isArray(contributors) ? contributors.length : 0

  // Commits last 30d
  result.commit_count_30d = Array.isArray(commits) ? commits.length : 0

  // Owner account age
  if (owner_info && typeof owner_info === 'object') {
    const oi = owner_info as Record<string, unknown>
    if (oi.created_at) {
      const days = Math.floor((Date.now() - new Date(oi.created_at as string).getTime()) / 86400000)
      result.owner_created_days_ago = days
    }
  }

  // File structure
  if (tree && typeof tree === 'object') {
    const t = tree as { tree?: Array<{ path: string; type: string }> }
    if (Array.isArray(t.tree)) {
      const files = t.tree.map(f => f.path.toLowerCase())
      result.has_readme = files.some(f => f.startsWith('readme'))
      result.has_tests = files.some(f => f.includes('test') || f.includes('spec') || f.startsWith('__tests__'))
      result.has_docs = files.some(f => f.startsWith('docs/') || f.startsWith('doc/'))
      result.total_files = t.tree.filter(f => f.type === 'blob').length
    }
  }

  // Code scanning alerts (GitHub Advanced Security)
  if (Array.isArray(codeAlerts)) {
    result.code_scanning_alerts = codeAlerts.length
  } else {
    result.code_scanning_alerts = null // feature not enabled
  }

  // Dependabot alerts
  if (dependabot === true || (Array.isArray(dependabot) && dependabot.length > 0)) {
    result.dependabot_alerts = Array.isArray(dependabot) ? dependabot.length : 'enabled'
  } else {
    result.dependabot_alerts = null
  }

  // Fake code flags
  const flags: string[] = []
  if (result.is_fork) flags.push('fork')
  if ((result.commit_count_30d as number) < 3) flags.push('low_activity')
  if (
    (result.contributors_count as number) <= 1 &&
    result.owner_created_days_ago !== undefined &&
    (result.owner_created_days_ago as number) < 60
  ) flags.push('new_account_sole_contributor')
  result.fake_code_flags = flags

  result.analyzed_at = new Date().toISOString()
  return result
}
