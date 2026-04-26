console.log('[ai.ts] module loaded OK')

const MODEL_MAP: Record<string, string> = {
  claude: 'anthropic/claude-sonnet-4.6',
  minimax: 'minimax/minimax-m2.5',
  gemini: 'google/gemini-2.5-flash',
  gpt4o: 'openai/gpt-4o',
  deepseek: 'deepseek/deepseek-v3.2',
  kimi: 'moonshotai/kimi-k2.5',
  glm: 'z-ai/glm-5',
}

interface ScoreProject {
  name: string
  github_url: string | null
  demo_url: string | null
  description: string | null
}

interface Dimension {
  name: string
  weight: number
  description?: string
}

interface ScoreResult {
  scores: Record<string, number>
  overall: number
  comment: string
  web3_insight?: string
}

async function fetchGithubReadme(githubUrl: string): Promise<string | null> {
  try {
    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return null
    const [, owner, repo] = match
    const headers: Record<string, string> = { Accept: 'application/vnd.github.raw+json' }
    const token = process.env.GITHUB_TOKEN
    if (token) headers['Authorization'] = `Bearer ${token}`
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers })
    if (!response.ok) return null
    const text = await response.text()
    return text.slice(0, 3000)
  } catch {
    return null
  }
}

async function fetchJinaPage(url: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      Accept: 'text/plain',
      'X-Return-Format': 'text',
    }
    const jinaKey = process.env.JINA_API_KEY
    if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`
    const response = await fetch(`https://r.jina.ai/${url}`, { headers })
    if (!response.ok) return null
    const text = await response.text()
    return text.slice(0, 2000)
  } catch {
    return null
  }
}

export async function enrichProject(project: ScoreProject): Promise<ScoreProject> {
  if (project.description && project.description.length > 50) {
    return project
  }

  let enriched = project.description || ''

  if (project.github_url) {
    try {
      const readme = await fetchGithubReadme(project.github_url)
      if (readme && readme.length > 50) {
        enriched = readme
      }
    } catch {}
  }

  if (enriched.length < 50 && project.demo_url) {
    try {
      const page = await fetchJinaPage(project.demo_url)
      if (page && page.length > 50) {
        enriched = page
      }
    } catch {}
  }

  return { ...project, description: enriched || project.description }
}

export async function scoreProject(
  project: ScoreProject,
  dimensions: Dimension[],
  modelKey: string,
  web3Enabled: boolean,
  web3InsightSummary?: string,
  sonarAnalysis?: Record<string, unknown> | null,
  codeAnalysis?: { is_real_code?: boolean; business_match_score?: number; code_quality_summary?: string } | null
): Promise<ScoreResult> {
  console.log('[scoreProject] start', modelKey, project.name)
  const apiUrl = process.env.ZENMUX_API_URL || process.env.COMMONSTACK_API_URL || 'https://zenmux.ai/api/v1'
  const apiKey = process.env.ZENMUX_API_KEY || process.env.COMMONSTACK_API_KEY

  if (!apiKey) throw new Error('ZENMUX_API_KEY not set')

  const modelId = MODEL_MAP[modelKey]
  if (!modelId) throw new Error(`Unknown model: ${modelKey}`)

  const dimensionsList = dimensions
    .map((d) => {
      const line = `- ${d.name}（权重 ${d.weight}%）：1-10分`
      return d.description ? `${line}\n  评分标准：${d.description}` : line
    })
    .join('\n')

  // Check if any dimension is Web3-related (by keyword matching)
  const web3Keywords = ['web3', 'blockchain', '区块链', '链上', 'defi', 'nft', 'token', '代币', '去中心', 'web3相关', 'web3契合', '生态']
  const hasWeb3Dimension = dimensions.some(d =>
    web3Keywords.some(kw => (d.name + (d.description ?? '')).toLowerCase().includes(kw))
  )

  // Only inject Web3Insight data if there's a matching dimension to avoid score pollution
  const web3Prompt = web3Enabled && web3InsightSummary
    ? hasWeb3Dimension
      ? `\n开发者 Web3 背景（来自 Web3Insight 真实链上数据）：${web3InsightSummary}\n\n请在评审 Web3 相关维度时参考以上真实数据，并在 web3_insight 字段提供洞察。`
      : `\n补充信息 - 开发者 Web3 背景：${web3InsightSummary}（此数据仅供参考，请专注于上述评分维度，不要因此调整与 Web3 无关的维度分数）`
    : ''

  // Code authenticity — global risk flag, injected before scoring dimensions
  let codeRiskPrompt = ''
  if (codeAnalysis) {
    if (codeAnalysis.is_real_code === false) {
      codeRiskPrompt = `\n⚠️ 代码真实性警告：AI 分析判定此项目代码疑似非真实开发（可能为 AI 生成或抄袭）。业务吻合度评分：${codeAnalysis.business_match_score ?? '未知'}/10。${codeAnalysis.code_quality_summary ? `代码总结：${codeAnalysis.code_quality_summary}` : ''}\n请在所有维度评分时综合考量此风险，适当降分。\n`
    } else if (codeAnalysis.is_real_code === true) {
      codeRiskPrompt = `\n✅ 代码真实性：AI 分析确认此项目为真实开发代码。业务吻合度：${codeAnalysis.business_match_score ?? '未知'}/10。${codeAnalysis.code_quality_summary ? `代码总结：${codeAnalysis.code_quality_summary}` : ''}\n`
    }
  }

  // SonarQube — inject into tech-related dimensions
  const techKeywords = ['技术', '代码', '工程', '实现', '架构', 'quality', '完成度', '可维护', '健壮']
  const hasTechDimension = dimensions.some(d =>
    techKeywords.some(kw => (d.name + (d.description ?? '')).toLowerCase().includes(kw))
  )
  let sonarPrompt = ''
  if (sonarAnalysis && Object.keys(sonarAnalysis).length > 0) {
    const bugs = sonarAnalysis.bugs ?? '—'
    const vulnerabilities = sonarAnalysis.vulnerabilities ?? '—'
    const codeSmells = sonarAnalysis.code_smells ?? '—'
    const coverage = sonarAnalysis.coverage != null ? `${sonarAnalysis.coverage}%` : '—'
    const duplications = sonarAnalysis.duplicated_lines_density != null ? `${sonarAnalysis.duplicated_lines_density}%` : '—'
    const rating = sonarAnalysis.reliability_rating ?? '—'
    const sonarSummary = `Bug 数：${bugs}，漏洞：${vulnerabilities}，代码异味：${codeSmells}，测试覆盖率：${coverage}，代码重复率：${duplications}，可靠性评级：${rating}`
    sonarPrompt = hasTechDimension
      ? `\nSonarQube 静态代码分析（客观数据）：${sonarSummary}\n请在评审技术实现相关维度时参考以上数据。\n`
      : `\n补充信息 - 代码质量扫描：${sonarSummary}（仅供参考）\n`
  }

  const prompt = `你是一位专业的黑客松评委。请根据以下维度对该项目进行评分。
${codeRiskPrompt}
项目名称：${project.name}
GitHub：${project.github_url || '未提供'}
Demo：${project.demo_url || '未提供'}
项目描述：${project.description || '未提供'}

评分维度（每项1-10分）：
${dimensionsList}
${sonarPrompt}${web3Prompt}

请仅返回有效的JSON格式（不要包含任何其他文字）：
{
  "scores": {
    ${dimensions.map((d) => `"${d.name}": 8`).join(',\n    ')}
  },
  "overall": 7.5,
  "comment": "2-3句话的综合评语"${web3Enabled ? ',\n  "web3_insight": "Web3相关洞察"' : ''}
}`

  let lastError: Error | null = null

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 8000,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''

      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')

      const result = JSON.parse(jsonMatch[0]) as ScoreResult

      // Validate result
      if (!result.scores || typeof result.overall !== 'number') {
        throw new Error('Invalid score format')
      }

      return result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError || new Error('Failed after 3 attempts')
}
