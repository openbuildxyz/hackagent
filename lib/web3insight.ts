/**
 * Web3Insight API — 查询 GitHub 用户/贡献者的 Web3 生态贡献度
 * 参考 hackathon-analyzer/analyze_developer.py
 */

const WEB3INSIGHT_BASE = 'https://api.web3insight.ai'
const GITHUB_API = 'https://api.github.com'
function githubHeaders() {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

function parseGithubUrl(url: string): [string, string] | null {
  const m = url?.match(/github\.com[/:]([^/]+)\/([^/\s?#]+)/)
  if (!m) return null
  return [m[1], m[2].replace(/\.git$/, '').replace(/\/$/, '')]
}

interface Web3InsightResult {
  total_score: number
  ecosystems: Array<{ name: string; score: number; repo_count: number; top_repos: string[] }>
  top_ecosystem: string | null
  is_web3_developer: boolean
  repo_count: number
  username: string
}

async function fetchWeb3InsightUser(username: string): Promise<Web3InsightResult> {
  const token = process.env.WEB3INSIGHT_TOKEN
  const empty: Web3InsightResult = {
    total_score: 0, ecosystems: [], top_ecosystem: null,
    is_web3_developer: false, repo_count: 0, username,
  }
  if (!token) return empty

  try {
    const res = await fetch(`${WEB3INSIGHT_BASE}/v2/external/github/users/username/${username}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return empty
    const data = await res.json() as Record<string, unknown>

    const ecosystemsRaw = (data?.eco_score as Record<string, unknown>)?.ecosystems as Array<Record<string, unknown>> ?? []
    const ecosystems: Web3InsightResult['ecosystems'] = []
    let totalScore = 0

    for (const eco of ecosystemsRaw) {
      let ecoName = eco.ecosystem as string | Record<string, unknown>
      if (typeof ecoName === 'object' && ecoName !== null) ecoName = (ecoName as Record<string, unknown>).name as string ?? ''
      const repos = (eco.repos as Array<Record<string, unknown>>) ?? []
      const ecoTotal = (eco.total_score as number) ?? repos.reduce((s: number, r) => s + ((r.score as number) ?? 0), 0)
      totalScore += ecoTotal
      ecosystems.push({
        name: ecoName as string,
        score: ecoTotal,
        repo_count: repos.length,
        top_repos: repos.slice(0, 3).map(r => r.repo_name as string ?? ''),
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
  } catch {
    return empty
  }
}

async function getRepoContributors(owner: string, repo: string): Promise<string[]> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=30&anon=0`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json() as Array<Record<string, unknown>>
    return data.filter(c => c.type === 'User').map(c => c.login as string).filter(Boolean)
  } catch {
    return []
  }
}

async function getOwnerType(owner: string): Promise<'User' | 'Organization'> {
  try {
    const res = await fetch(`${GITHUB_API}/users/${owner}`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return 'User'
    const data = await res.json() as Record<string, unknown>
    return (data.type as string) === 'Organization' ? 'Organization' : 'User'
  } catch {
    return 'User'
  }
}

export interface Web3Analysis {
  web3insight: {
    total_score: number
    ecosystems: Array<{ name: string; score: number; repo_count: number; top_repos: string[] }>
    top_ecosystem: string | null
    is_web3_developer: boolean
    repo_count: number
  }
  contributors: Array<{ username: string; web3_score: number; is_web3_dev: boolean; top_eco: string | null }>
  github_username: string | null
  twitter: TwitterData | null
  analyzed_at: string
}

const TWITTER_HOST = 'twitter-api47.p.rapidapi.com'

function getRapidApiKey() { return process.env.RAPIDAPI_KEY || '' }

function extractTwitterHandle(text: string): string | null {
  if (!text) return null
  // Match post URL: twitter.com/user/status/... or x.com/user/status/...
  const postMatch = text.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,50})\/status\//)
  if (postMatch) return postMatch[1]
  // Match profile URL
  const profileMatch = text.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,50})(?:[/?#]|$)/)
  if (profileMatch) {
    const handle = profileMatch[1]
    if (!['home', 'i', 'intent', 'share', 'explore', 'search'].includes(handle.toLowerCase())) return handle
  }
  // Match @handle
  const atMatch = text.match(/@([A-Za-z0-9_]{3,50})/)
  if (atMatch) return atMatch[1]
  return null
}

export interface TwitterData {
  handle: string
  followers: number
  tweets_count: number
  is_kol: boolean
  has_influence: boolean
}

async function fetchTwitterUser(handle: string): Promise<TwitterData | null> {
  if (!getRapidApiKey()) return null
  try {
    const res = await fetch(`https://${TWITTER_HOST}/v2/user/info?username=${encodeURIComponent(handle)}`, {
      headers: { 'x-rapidapi-key': getRapidApiKey(), 'x-rapidapi-host': TWITTER_HOST },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>
    const user = (data?.data as Record<string, unknown>)?.user as Record<string, unknown>
    const result = (user?.result as Record<string, unknown>) ?? user ?? data
    const legacy = (result?.legacy as Record<string, unknown>) ?? result
    const followers = (legacy?.followers_count as number) || 0
    return {
      handle,
      followers,
      tweets_count: (legacy?.statuses_count as number) || 0,
      is_kol: followers > 5000,
      has_influence: followers > 1000,
    }
  } catch {
    return null
  }
}


export async function analyzeWeb3(githubUrl: string, extraText?: string): Promise<Web3Analysis | null> {
  const parsed = parseGithubUrl(githubUrl)
  if (!parsed) return null
  const [owner, repo] = parsed

  // Extract Twitter handle from extra text
  const twitterHandle = extraText ? extractTwitterHandle(extraText) : null

  // Determine if owner is user or org
  const ownerType = await getOwnerType(owner)
  let usernamesToCheck: string[]

  if (ownerType === 'Organization') {
    const contributors = await getRepoContributors(owner, repo)
    if (contributors.length > 0) {
      usernamesToCheck = contributors.slice(0, 20)
    } else {
      // Org but no contributors from API — try to get committers from commits
      try {
        const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits?per_page=30`, {
          headers: githubHeaders(),
          signal: AbortSignal.timeout(8000),
        })
        if (res.ok) {
          const commits = await res.json() as Array<Record<string, unknown>>
          const logins = new Set<string>()
          for (const c of commits) {
            const authorLogin = (c.author as Record<string, unknown> | null)?.login as string | undefined
            if (authorLogin) logins.add(authorLogin)
          }
          usernamesToCheck = logins.size > 0 ? Array.from(logins).slice(0, 10) : []
        } else {
          usernamesToCheck = []
        }
      } catch {
        usernamesToCheck = []
      }
    }
  } else {
    usernamesToCheck = [owner]
  }

  // Parallel: Web3Insight + Twitter
  const [w3Results, twitterData] = await Promise.all([
    Promise.all(usernamesToCheck.slice(0, 30).map(u => fetchWeb3InsightUser(u))),
    twitterHandle ? fetchTwitterUser(twitterHandle) : Promise.resolve(null),
  ])
  const results = w3Results

  // Aggregate
  const totalScore = results.reduce((s, r) => s + r.total_score, 0)
  const isWeb3Dev = results.some(r => r.is_web3_developer)

  // Merge ecosystems
  const ecoMap = new Map<string, { name: string; score: number; repo_count: number; top_repos: string[] }>()
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
  const mergedEcosystems = Array.from(ecoMap.values()).sort((a, b) => b.score - a.score)

  return {
    web3insight: {
      total_score: totalScore,
      ecosystems: mergedEcosystems.slice(0, 8),
      top_ecosystem: mergedEcosystems[0]?.name ?? null,
      is_web3_developer: isWeb3Dev,
      repo_count: results.reduce((s, r) => s + r.repo_count, 0),
    },
    contributors: results.map(r => ({
      username: r.username,
      web3_score: r.total_score,
      is_web3_dev: r.is_web3_developer,
      top_eco: r.top_ecosystem,
    })),
    github_username: owner,
    twitter: twitterData,
    analyzed_at: new Date().toISOString(),
  }
}

/**
 * Build a summary string to inject into AI scoring prompt
 */
export function buildWeb3InsightSummary(analysis: Web3Analysis | null): string {
  if (!analysis) return '无Web3开发记录'
  const w3 = analysis.web3insight
  if (!w3.is_web3_developer) {
    return `贡献者${analysis.contributors.length}人，均无Web3记录`
  }
  const ecos = w3.ecosystems.slice(0, 3).map(e => e.name).filter(Boolean).join('、')
  return `Web3开发者 ✓ | 生态: ${ecos || '未知'} | 综合评分: ${w3.total_score} | 仓库数: ${w3.repo_count}`
}
