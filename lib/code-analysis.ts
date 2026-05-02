import { getZenmuxApiKey, getZenmuxChatApiBase } from './zenmux'

/**
 * Code analysis via GitHub API + LLM.
 * Mirrors hackathon-analyzer's repomix+LLM approach, but uses GitHub API
 * to fetch file contents directly (no clone needed, works on Vercel).
 */

const GITHUB_API = 'https://api.github.com'

function getEnv() {
  return {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
    ZENMUX_API_URL: getZenmuxChatApiBase(),
    ZENMUX_API_KEY: getZenmuxApiKey(),
  }
}

function githubHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'HackAgent/1.0',
  }
  if (getEnv().GITHUB_TOKEN) h['Authorization'] = `Bearer ${getEnv().GITHUB_TOKEN}`
  return h
}

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.vue', '.svelte', '.sol', '.move',
])
const NON_CODE_EXTS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.env',
  '.lock', '.sum', '.png', '.jpg', '.gif', '.svg', '.ico', '.pdf',
])

function ext(path: string): string {
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i).toLowerCase() : ''
}

interface FileItem {
  path: string
  type: string
  size?: number
  url?: string
  sha?: string
}

/**
 * Fetch file content via GitHub API (raw). Returns truncated text.
 */
async function fetchFileContent(owner: string, repo: string, path: string, maxBytes = 4000): Promise<string> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      {
        headers: { ...githubHeaders(), Accept: 'application/vnd.github.raw+json' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return ''
    const text = await res.text()
    return text.slice(0, maxBytes)
  } catch {
    return ''
  }
}

/**
 * Pick representative code files from tree:
 * - Prefer non-test, non-config files
 * - Up to 5 files, total ~12000 chars
 */
function pickCodeFiles(tree: FileItem[]): FileItem[] {
  const blobs = tree.filter(f => f.type === 'blob' && f.size && f.size > 0)
  // Score: prefer code exts, avoid test/mock/generated files
  const scored = blobs
    .filter(f => CODE_EXTS.has(ext(f.path)))
    .filter(f => {
      const p = f.path.toLowerCase()
      return !p.includes('test') && !p.includes('spec') && !p.includes('mock') &&
             !p.includes('.min.') && !p.includes('generated') && !p.includes('dist/')
    })
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0)) // largest first
  return scored.slice(0, 5)
}

export interface LLMCodeAnalysis {
  is_real_code: boolean | null
  business_match_score: number | null  // 0-10
  code_quality_summary: string
  llm_error?: string
}

/**
 * Fetch code files from GitHub and ask LLM:
 * - Is this real code implementing the described functionality?
 * - How well does the code match the project description?
 * Mirrors hackathon-analyzer's _llm_business_match().
 */
export async function analyzeCodeWithLLM(
  owner: string,
  repo: string,
  tree: FileItem[],
  projectName: string,
  projectDescription: string
): Promise<LLMCodeAnalysis> {
  const defaultResult: LLMCodeAnalysis = {
    is_real_code: null,
    business_match_score: null,
    code_quality_summary: '',
  }

  if (!getEnv().ZENMUX_API_KEY) return { ...defaultResult, llm_error: 'no api key' }

  const filesToFetch = pickCodeFiles(tree)
  if (filesToFetch.length === 0) {
    return { ...defaultResult, llm_error: 'no code files found' }
  }

  // Fetch files in parallel with timeout
  const contents = await Promise.all(
    filesToFetch.map(async f => {
      const content = await fetchFileContent(owner, repo, f.path, 2400)
      return content ? `// === ${f.path} ===\n${content}` : ''
    })
  )
  const codeBundle = contents.filter(Boolean).join('\n\n').slice(0, 12000)

  if (!codeBundle.trim()) {
    return { ...defaultResult, llm_error: 'failed to fetch code content' }
  }

  const prompt = `你是一位资深技术评审专家，请分析以下代码仓库内容，回答三个问题。

项目名称：${projectName}
项目描述：${(projectDescription || '（无）').slice(0, 500)}

代码文件节选（共 ${filesToFetch.length} 个文件）：
${codeBundle}

请以 JSON 格式返回，包含以下字段：
- is_real_code: true/false，代码是否真实实现了业务功能（非空壳/复制粘贴/纯模板/Demo boilerplate）
- business_match_score: 0-10 整数，代码实现与项目描述的吻合程度
- code_quality_summary: 不超过100字的中文总结，说明代码质量、架构合理性和主要问题

只返回 JSON，不要其他文字。`

  // Retry up to 2 times, mirroring hackathon-analyzer's error handling
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${getEnv().ZENMUX_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getEnv().ZENMUX_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'minimax/minimax-m2.5',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) throw new Error(`API ${res.status}`)

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      let content = data.choices?.[0]?.message?.content?.trim() ?? ''

      // Strip <think> blocks (MiniMax M2.5 reasoning)
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      // Strip markdown fences
      content = content.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

      // Try to parse; if truncated, attempt to close the JSON
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(content) as Record<string, unknown>
      } catch {
        // Attempt to fix truncated JSON by appending closing chars
        const fixed = content.replace(/,?\s*$/, '') + '}'
        try { parsed = JSON.parse(fixed) as Record<string, unknown> } catch { /* ignore */ }
      }

      if (parsed) {
        return {
          is_real_code: typeof parsed.is_real_code === 'boolean' ? parsed.is_real_code : null,
          business_match_score: typeof parsed.business_match_score === 'number'
            ? Math.max(0, Math.min(10, parsed.business_match_score))
            : null,
          code_quality_summary: typeof parsed.code_quality_summary === 'string'
            ? parsed.code_quality_summary
            : '',
        }
      }

      throw new Error('JSON parse failed after repair attempt')
    } catch (err) {
      if (attempt === 1) {
        return { ...defaultResult, llm_error: String(err) }
      }
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  return defaultResult
}

/**
 * Compute additional fake_code_flags from tree + owner info.
 * Mirrors hackathon-analyzer's flag detection.
 */
export function computeFakeCodeFlags(params: {
  isFork: boolean
  commitCount30d: number
  contributorsCount: number
  ownerCreatedDaysAgo: number | null
  tree: FileItem[]
  isRealCode?: boolean | null
}): string[] {
  const { isFork, commitCount30d, contributorsCount, ownerCreatedDaysAgo, tree, isRealCode } = params
  const flags: string[] = []

  const blobs = tree.filter(f => f.type === 'blob')
  const totalFiles = blobs.length

  if (isFork) flags.push('fork')

  if (
    contributorsCount <= 1 &&
    ownerCreatedDaysAgo !== null &&
    ownerCreatedDaysAgo < 60
  ) {
    flags.push('new_account_sole_contributor')
  }

  if (commitCount30d < 5 && totalFiles < 10) flags.push('low_activity')

  const nonCodeFiles = blobs.filter(f => NON_CODE_EXTS.has(ext(f.path)) || f.path.startsWith('.'))
  if (totalFiles > 0 && nonCodeFiles.length / totalFiles > 0.8) {
    flags.push('mostly_non_code')
  }

  if (isRealCode === false) flags.push('llm_fake_code')

  return flags
}
