import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { getZenmuxApiKey, getZenmuxChatApiBase } from '@/lib/zenmux'

const API_BASE = getZenmuxChatApiBase()
const API_KEY = getZenmuxApiKey()
const MODEL = 'openai/gpt-4.1-nano'

export interface ColumnMapping {
  name: string | null
  github_url: string | null
  description: string | null
  demo_url: string | null
  team_name: string | null
  tags: string | null
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { headers, sampleRows } = await req.json() as {
    headers: string[]
    sampleRows?: string[][]
  }

  if (!headers || headers.length === 0) {
    return NextResponse.json({ error: '缺少表头' }, { status: 400 })
  }

  const prompt = `你是一个 CSV 列名语义识别助手。给定以下 CSV 表头和前几行示例数据，识别每列对应的语义字段。

目标字段：
- name: 项目名称（必填）
- github_url: GitHub 仓库链接（必填）
- description: 项目描述/介绍（必填）
- demo_url: 演示/产品链接（可选）
- team_name: 团队名称（可选）
- tags: 标签/赛道/分类（可选）

表头：${JSON.stringify(headers)}
${sampleRows && sampleRows.length > 0 ? `示例数据（前${sampleRows.length}行）：${JSON.stringify(sampleRows)}` : ''}

规则：
1. 根据列名和示例数据的语义判断，不要求精确匹配
2. value 必须是表头中存在的原始列名，找不到则为 null
3. 只返回 JSON，不要其他内容

示例输出：{"name": "Project Name", "github_url": "GitHub Link", "description": "Project Intro", "demo_url": null, "team_name": "Team", "tags": "Track"}`

  try {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim() ?? ''

    let mapping: ColumnMapping
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      mapping = JSON.parse(jsonMatch ? jsonMatch[0] : content)
    } catch {
      throw new Error('AI 返回格式错误')
    }

    // Validate returned column names exist in headers
    const normalized: ColumnMapping = {
      name:        headers.includes(mapping.name ?? '') ? mapping.name : null,
      github_url:  headers.includes(mapping.github_url ?? '') ? mapping.github_url : null,
      description: headers.includes(mapping.description ?? '') ? mapping.description : null,
      demo_url:    headers.includes(mapping.demo_url ?? '') ? mapping.demo_url : null,
      team_name:   headers.includes(mapping.team_name ?? '') ? mapping.team_name : null,
      tags:        headers.includes(mapping.tags ?? '') ? mapping.tags : null,
    }

    return NextResponse.json({ mapping: normalized })
  } catch {
    // Fallback to keyword matching
    const mapping = keywordMatch(headers)
    return NextResponse.json({ mapping, fallback: true })
  }
}

function keywordMatch(headers: string[]): ColumnMapping {
  const lower = headers.map(h => h.toLowerCase().trim())

  const ALIASES: Record<keyof ColumnMapping, string[]> = {
    name:        ['name', '项目名称', '项目名', '名称', 'project_name', 'project name', 'project_title', 'title', 'submission name', 'app name'],
    github_url:  ['github_url', 'github', 'github链接', 'github地址', 'github link', 'github url', 'repo', 'repository', '仓库地址', 'source code', 'code url'],
    description: ['description', '描述', '项目描述', '项目介绍', 'intro', '简介', 'summary', 'project description', 'about', 'overview', 'brief'],
    demo_url:    ['demo_url', 'demo', 'demo链接', '演示链接', 'website', '网站', 'demo link', 'live url', 'app url', 'product url'],
    team_name:   ['team_name', 'team', '团队', '团队名称', '队伍', 'team name', 'group name'],
    tags:        ['tags', '标签', '赛道', 'track', 'category', 'categories', 'tag', 'track name'],
  }

  function findCol(field: keyof ColumnMapping): string | null {
    for (const alias of ALIASES[field]) {
      const idx = lower.indexOf(alias)
      if (idx >= 0) return headers[idx]
    }
    for (const alias of ALIASES[field]) {
      const idx = lower.findIndex(h => h.includes(alias) || alias.includes(h))
      if (idx >= 0) return headers[idx]
    }
    return null
  }

  return {
    name:        findCol('name'),
    github_url:  findCol('github_url'),
    description: findCol('description'),
    demo_url:    findCol('demo_url'),
    team_name:   findCol('team_name'),
    tags:        findCol('tags'),
  }
}
