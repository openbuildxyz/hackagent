import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/session'
import { getZenmuxApiKey, getZenmuxChatApiBase } from '@/lib/zenmux'

interface GeneratedEvent {
  name: string
  track: string
  description: string
  tracks: { id: string; name: string; description: string; prize: string }[]
  dimensions: { name: string; weight: number }[]
  models: string[]
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt } = await req.json()
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  const apiUrl = getZenmuxChatApiBase()
  const apiKey = getZenmuxApiKey()
  if (!apiKey) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })

  const systemPrompt = `你是一个 Hackathon 组织顾问。根据用户的描述，生成一份结构化的活动方案。

必须严格返回以下 JSON 格式，不要包含任何其他文字：
{
  "name": "活动名称（简洁有力，15字以内）",
  "track": "主赛道或主题（单行描述，20字以内）",
  "description": "活动详细描述（2-3段，介绍背景、目标和参与要求）",
  "tracks": [
    { "id": "track1", "name": "赛道名称", "description": "赛道说明", "prize": "奖金金额或空字符串" }
  ],
  "dimensions": [
    { "name": "维度名称", "weight": 25 }
  ],
  "models": ["minimax", "gemini"]
}

规则：
- dimensions 权重之和必须恰好为 100，建议 3-5 个维度
- tracks 建议 2-4 个，与描述匹配；如用户未提到多赛道，可提供 1-2 个
- 如用户未提到奖金，prize 字段留空字符串
- models 从以下选项中选择：claude、minimax、gemini、gpt4o、deepseek、kimi、glm，建议 3-5 个
- 返回内容必须是合法 JSON，不得有注释或额外文字`

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'minimax/minimax-m2.5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt.trim() },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }

  const data = await response.json()
  const content: string = data.choices?.[0]?.message?.content || ''

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })
  }

  let result: GeneratedEvent
  try {
    result = JSON.parse(jsonMatch[0]) as GeneratedEvent
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 })
  }

  // Ensure weights sum to 100
  if (Array.isArray(result.dimensions) && result.dimensions.length > 0) {
    const total = result.dimensions.reduce((s, d) => s + (d.weight || 0), 0)
    if (total !== 100) {
      const diff = 100 - total
      result.dimensions[0].weight += diff
    }
  }

  // Ensure track ids are present
  if (Array.isArray(result.tracks)) {
    result.tracks = result.tracks.map((t, i) => ({
      ...t,
      id: t.id || `track${i + 1}`,
    }))
  }

  return NextResponse.json(result)
}
