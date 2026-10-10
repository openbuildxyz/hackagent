import { getChatConfigForModelKey } from './zenmux'
import { MODEL_IDS } from './models'
import { isRetryableError, redactError, serviceError } from './github-source'

/**
 * Code analysis via GitHub API + LLM.
 * Mirrors hackathon-analyzer's repomix+LLM approach, but uses GitHub API
 * to fetch file contents directly (no clone needed, works on Vercel).
 */

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.vue', '.svelte', '.sol', '.move',
  '.html', '.css', '.mjs', '.cjs', '.dart', '.ex', '.exs',
])
const NON_CODE_EXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.lock', '.png', '.jpg', '.svg'])

function ext(path: string): string {
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i).toLowerCase() : ''
}

export interface FileItem {
  path: string
  type: string
  size?: number
  url?: string
  sha?: string
  content?: string
}

const DEPENDENCIES = new Set(['node_modules', 'vendor', 'venv', '.venv', '.git', 'forge-std',
  'openzeppelin-contracts', 'openzeppelin-contracts-upgradeable', 'solmate', 'solady', 'ds-test',
  'chainlink-brownie-contracts'])
const GENERATED = new Set(['dist', 'build', 'out', 'coverage', '.next', '.nuxt', 'target', 'artifacts', 'cache'])

export function pickCodeFiles(tree: FileItem[]): FileItem[] {
  const priority = (file: FileItem) => {
    const parts = file.path.toLowerCase().split('/')
    return (parts.some(part => ['src', 'app', 'contracts', 'server', 'backend', 'frontend'].includes(part)) ? 40 : 0)
      + (ext(file.path) === '.sol' ? 15 : 0)
      - (['.css'].includes(ext(file.path)) ? 40 : 0)
      - (parts.some(part => ['i18n', 'locales', 'translations', 'pitch', 'slides', 'presentation', 'landing', 'sections'].includes(part)) ? 35 : 0)
      - (/fixture|(^|\/)(mock[^/]*|[^/]*\.config\.[^/]*)$/i.test(file.path) ? 35 : 0)
      + Math.min(Math.log2(file.size || 1), 14)
      - (parts.some(part => ['scripts', 'script', 'migrations'].includes(part)) ? 30 : 0)
  }
  const candidates = tree.filter(file => {
    if (file.type !== 'blob' || !file.size || (file.content !== undefined && !file.content.trim()) || !CODE_EXTS.has(ext(file.path))) return false
    const parts = file.path.toLowerCase().split('/')
    if (parts.some(part => DEPENDENCIES.has(part) || GENERATED.has(part))) return false
    if (parts.some(part => ['test', 'tests', '__tests__', 'spec', 'specs', 'mock', 'mocks'].includes(part))) return false
    return !/\.(test|spec|min|generated)\./i.test(parts[parts.length - 1]) && !file.path.endsWith('.d.ts')
  }).sort((a, b) => priority(b) - priority(a) || a.path.localeCompare(b.path))
  // Balance coverage without allowing low-value CSS/marketing files to displace business logic.
  const selected: FileItem[] = []
  const groups = new Map<string, number>()
  for (const file of candidates) {
    const group = file.path.split('/').slice(0, -1).join('/') + ':' + ext(file.path)
    if ((groups.get(group) || 0) < 2) { selected.push(file); groups.set(group, (groups.get(group) || 0) + 1) }
    if (selected.length === 8) return selected
  }
  for (const file of candidates) if (!selected.includes(file) && selected.length < 8) selected.push(file)
  return selected
}

function excerpt(content: string) {
  if (content.length <= 2400) return content
  const middle = Math.max(1200, Math.floor(content.length / 2) - 400)
  return content.slice(0, 1200) + '\n// [middle excerpt]\n' + content.slice(middle, middle + 600)
    + '\n// [end excerpt]\n' + content.slice(-600)
}

export interface LLMCodeAnalysis {
  is_real_code: boolean | null
  business_match_score: number | null  // 0-10
  code_quality_summary: string
  llm_error?: string
  sampled_files?: string[]
  source_ref?: string
  source_digest?: string
  model?: string
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
  projectDescription: string,
  source?: { ref: string; digest: string }
): Promise<LLMCodeAnalysis> {
  const defaultResult: LLMCodeAnalysis = {
    is_real_code: null,
    business_match_score: null,
    code_quality_summary: '',
    sampled_files: [],
    source_ref: source?.ref,
    source_digest: source?.digest,
  }

  const config = getChatConfigForModelKey('minimax')
  if (!config.apiKey) return { ...defaultResult, llm_error: 'MiniMax API key is not configured' }

  const filesToFetch = pickCodeFiles(tree)
  if (filesToFetch.length === 0) {
    return { ...defaultResult, llm_error: 'no code files found' }
  }

  const available = filesToFetch.filter(file => file.content?.trim())
  const codeBundle = available.map(file => `// === ${file.path} ===\n${excerpt(file.content!)}`).join('\n\n')
  defaultResult.sampled_files = available.map(file => file.path)
  if (!codeBundle.trim()) return { ...defaultResult, llm_error: 'Source snapshot contains no readable business code' }

  const prompt = `你是一位资深技术评审专家，请分析以下代码仓库内容，回答三个问题。

项目名称：${projectName}
项目描述：${(projectDescription || '（无）').slice(0, 500)}

代码文件节选（共 ${available.length} 个文件，来自同一个源码快照）：
${codeBundle}

请以 JSON 格式返回，包含以下字段：
- is_real_code: true/false/null，样本是否呈现实际业务实现；证据不足时为 null，不推断作者、抄袭或生成方式
- business_match_score: 0-10 整数或 null，样本与项目描述的吻合程度；证据不足时为 null
- code_quality_summary: 不超过100字的中文总结，说明代码质量、架构合理性和主要问题

这些文件是抽样节选；不要将截断、未采样功能或第三方依赖视为抄袭、AI生成或项目不存在的证明。只评价实际可见的业务实现，说明证据限制。
只返回 JSON，不要其他文字。`

  // Retry up to 2 times, mirroring hackathon-analyzer's error handling
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${config.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL_IDS.minimax,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2400,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(45000),
      })

      if (!res.ok) throw await serviceError(res, 'MiniMax code analysis')

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      let content = data.choices?.[0]?.message?.content?.trim() ?? ''

      // Strip <think> blocks (MiniMax reasoning)
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

      if (parsed && (parsed.is_real_code === null || typeof parsed.is_real_code === 'boolean')
        && (parsed.business_match_score === null || (typeof parsed.business_match_score === 'number' && Number.isFinite(parsed.business_match_score))) && typeof parsed.code_quality_summary === 'string'
        && parsed.code_quality_summary.trim()) {
        return {
          ...defaultResult,
          model: MODEL_IDS.minimax,
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
      if (attempt === 1 || !isRetryableError(err)) {
        return { ...defaultResult, llm_error: redactError(String(err)) }
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
