import { ALL_MODEL_KEYS, MODEL_CREDITS, MODEL_IDS, MODEL_NAMES } from './models'
import {
  getChatProviderForModelKey,
  getChatConfigForModelKey,
  getGptChatApiBase,
  getTencentApiKey,
  getTencentChatApiBase,
  getTemperatureForModel,
  getZenmuxApiKey,
  getZenmuxChatApiBase,
  getZenmuxVertexApiBase,
} from './zenmux'

type ConfigStatus = 'configured' | 'missing'

export type AdminEnvVarStatus = {
  name: string
  configured: boolean
  secret: boolean
}

export type AdminModelConfig = {
  key: string
  displayName: string
  modelId: string
  provider: string
  baseUrl: string
  env: AdminEnvVarStatus[]
  configured: boolean
  credits: number
  temperature: number
  notes: string
}

export type AdminServiceConfig = {
  key: string
  name: string
  provider: string
  baseUrl: string
  env: AdminEnvVarStatus[]
  status: ConfigStatus
  notes: string
}

export type AdminModelConfigSnapshot = {
  readOnly: true
  readOnlyReason: string
  models: AdminModelConfig[]
  services: AdminServiceConfig[]
}

export type AdminConnectionTestTarget = {
  type: 'model' | 'service'
  key: string
}

export type AdminConnectionTestResult = {
  ok: boolean
  status: 'ok' | 'warning' | 'error' | 'missing'
  target: AdminConnectionTestTarget
  checkedAt: string
  latencyMs: number
  message: string
  httpStatus?: number
}

function envStatus(name: string, secret = true): AdminEnvVarStatus {
  return { name, configured: Boolean(process.env[name]), secret }
}

function anyConfigured(names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]))
}

function allConfigured(names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]))
}

function providerBaseUrl(provider: string): string {
  if (provider === 'tencent') return getTencentChatApiBase()
  if (provider === 'gpt') return getGptChatApiBase()
  return getZenmuxChatApiBase()
}

function providerEnv(provider: string): AdminEnvVarStatus[] {
  if (provider === 'tencent') {
    return [
      envStatus('TENCENT_MODEL_API_KEY'),
      envStatus('TENCENT_MODEL_API_URL', false),
    ]
  }
  if (provider === 'gpt') {
    return [
      envStatus('GPT_MODEL_API_KEY'),
      envStatus('GPT_MODEL_API_URL', false),
    ]
  }
  return [
    envStatus('ZENMUX_PAY2GO_API_KEY'),
    envStatus('ZENMUX_API_KEY'),
    envStatus('COMMONSTACK_API_KEY'),
    envStatus('ZENMUX_PAY2GO_API_URL', false),
    envStatus('ZENMUX_API_URL', false),
    envStatus('COMMONSTACK_API_URL', false),
  ]
}

function providerConfigured(provider: string): boolean {
  if (provider === 'tencent') return Boolean(process.env.TENCENT_MODEL_API_KEY)
  if (provider === 'gpt') return Boolean(process.env.GPT_MODEL_API_KEY)
  return anyConfigured(['ZENMUX_PAY2GO_API_KEY', 'ZENMUX_API_KEY', 'COMMONSTACK_API_KEY'])
}

function serviceStatus(env: AdminEnvVarStatus[], requiredNames?: string[]): ConfigStatus {
  const required = requiredNames
    ? env.filter((item) => requiredNames.includes(item.name))
    : env.filter((item) => item.secret)
  return required.every((item) => item.configured) ? 'configured' : 'missing'
}

export function getAdminModelConfigSnapshot(): AdminModelConfigSnapshot {
  const models = ALL_MODEL_KEYS.map((key) => {
    const provider = getChatProviderForModelKey(key)
    const modelId = MODEL_IDS[key]
    return {
      key,
      displayName: MODEL_NAMES[key] ?? key,
      modelId,
      provider,
      baseUrl: providerBaseUrl(provider),
      env: providerEnv(provider),
      configured: providerConfigured(provider),
      credits: MODEL_CREDITS[key] ?? 1,
      temperature: getTemperatureForModel(modelId, 0.3),
      notes: key === 'kimi'
        ? 'Kimi K2.5 forces temperature 1 in runtime calls; other review models use 0.3.'
        : 'Used by project review scoring through lib/ai.ts.',
    }
  })

  const services: AdminServiceConfig[] = [
    {
      key: 'event-generation',
      name: 'Event Plan Generation',
      provider: 'tencent',
      baseUrl: getTencentChatApiBase(),
      env: providerEnv('tencent'),
      status: providerConfigured('tencent') ? 'configured' : 'missing',
      notes: 'Uses minimax-m2.5 for /api/ai/generate-event.',
    },
    {
      key: 'code-analysis',
      name: 'Code Authenticity Analysis',
      provider: 'tencent',
      baseUrl: getTencentChatApiBase(),
      env: [...providerEnv('tencent'), envStatus('GITHUB_TOKEN')],
      status: providerConfigured('tencent') ? 'configured' : 'missing',
      notes: 'Uses minimax-m2.5 plus GitHub API; GITHUB_TOKEN is optional but improves rate limits.',
    },
    {
      key: 'team-auto-match',
      name: 'Team Auto Match',
      provider: 'zenmux',
      baseUrl: getZenmuxChatApiBase(),
      env: providerEnv('zenmux'),
      status: providerConfigured('zenmux') ? 'configured' : 'missing',
      notes: 'Uses z-ai/glm-4.5-air through the ZenMux-compatible chat endpoint.',
    },
    {
      key: 'image-generation',
      name: 'Event Banner Image Generation',
      provider: 'poe',
      baseUrl: (process.env.POE_API_URL || 'https://api.poe.com/v1').replace(/\/+$/, ''),
      env: [
        envStatus('POE_API_KEY'),
        envStatus('POE_API_URL', false),
        envStatus('POE_IMAGE_MODEL', false),
        envStatus('POE_IMAGE_SIZE', false),
      ],
      status: process.env.POE_API_KEY ? 'configured' : 'missing',
      notes: `Uses ${process.env.POE_IMAGE_MODEL || 'gpt-image-2'} at ${process.env.POE_IMAGE_SIZE || '1536x864'}; secrets are not exposed.`,
    },
    {
      key: 'github-enrichment',
      name: 'GitHub and Demo Enrichment',
      provider: 'github/jina',
      baseUrl: 'https://api.github.com, https://r.jina.ai',
      env: [envStatus('GITHUB_TOKEN'), envStatus('JINA_API_KEY')],
      status: 'configured',
      notes: 'Both tokens are optional; missing values fall back to unauthenticated requests where supported.',
    },
    {
      key: 'web3insight',
      name: 'Web3Insight Developer Analysis',
      provider: 'web3insight',
      baseUrl: 'https://api.web3insight.ai/v1',
      env: [envStatus('WEB3INSIGHT_TOKEN'), envStatus('GITHUB_TOKEN')],
      status: process.env.WEB3INSIGHT_TOKEN ? 'configured' : 'missing',
      notes: 'WEB3INSIGHT_TOKEN is required for Web3 mode; GITHUB_TOKEN is optional helper context.',
    },
    {
      key: 'sonar',
      name: 'SonarQube Code Quality Proxy',
      provider: 'sonar-proxy',
      baseUrl: process.env.SONAR_PROXY_URL || 'SONAR_PROXY_URL',
      env: [envStatus('SONAR_PROXY_URL', false), envStatus('SONAR_PROXY_SECRET')],
      status: allConfigured(['SONAR_PROXY_URL', 'SONAR_PROXY_SECRET']) ? 'configured' : 'missing',
      notes: 'Required only when SonarQube deep analysis is enabled.',
    },
    {
      key: 'zenmux-vertex',
      name: 'ZenMux Vertex Endpoint',
      provider: 'zenmux',
      baseUrl: getZenmuxVertexApiBase(),
      env: [
        envStatus('ZENMUX_PAY2GO_VERTEX_API_URL', false),
        envStatus('ZENMUX_VERTEX_API_URL', false),
        ...providerEnv('zenmux'),
      ],
      status: serviceStatus(providerEnv('zenmux')),
      notes: 'Tracked because lib/zenmux.ts exposes the Vertex-compatible base URL for model tooling.',
    },
  ]

  return {
    readOnly: true,
    readOnlyReason: 'No app-level model metadata/config table exists in the current schema, so this admin surface is read-only and only reports non-secret runtime configuration.',
    models,
    services,
  }
}

function redactMessage(message: string): string {
  let redacted = message
  const secrets = [
    process.env.ZENMUX_PAY2GO_API_KEY,
    process.env.ZENMUX_API_KEY,
    process.env.COMMONSTACK_API_KEY,
    process.env.TENCENT_MODEL_API_KEY,
    process.env.GPT_MODEL_API_KEY,
    process.env.POE_API_KEY,
    process.env.WEB3INSIGHT_TOKEN,
    process.env.SONAR_PROXY_SECRET,
  ]
  for (const secret of secrets) {
    if (secret) redacted = redacted.replaceAll(secret, '[redacted]')
  }
  return redacted.slice(0, 500)
}

async function timedTest(
  target: AdminConnectionTestTarget,
  fn: () => Promise<{ ok: boolean; status?: 'ok' | 'warning' | 'error'; message: string; httpStatus?: number }>
): Promise<AdminConnectionTestResult> {
  const started = Date.now()
  try {
    const result = await fn()
    const status = result.status ?? (result.ok ? 'ok' : 'error')
    return {
      ok: result.ok,
      status,
      target,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: redactMessage(result.message),
      httpStatus: result.httpStatus,
    }
  } catch (err) {
    return {
      ok: false,
      status: 'error',
      target,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      message: redactMessage(err instanceof Error ? err.message : String(err)),
    }
  }
}

function missingResult(target: AdminConnectionTestTarget, message: string): AdminConnectionTestResult {
  return {
    ok: false,
    status: 'missing',
    target,
    checkedAt: new Date().toISOString(),
    latencyMs: 0,
    message,
  }
}

async function testChatCompletion(
  target: AdminConnectionTestTarget,
  apiUrl: string,
  apiKey: string,
  model: string
): Promise<AdminConnectionTestResult> {
  if (!apiKey) return missingResult(target, 'Required API key is not configured')

  return timedTest(target, async () => {
    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        temperature: getTemperatureForModel(model, 0),
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        httpStatus: res.status,
        message: `Chat completion failed with HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`,
      }
    }
    const data = await res.json().catch(() => null) as { choices?: unknown[] } | null
    const ok = Boolean(data?.choices?.length)
    return {
      ok,
      status: ok ? 'ok' : 'warning',
      httpStatus: res.status,
      message: ok ? 'Chat completion endpoint responded successfully' : 'Endpoint responded but did not return choices',
    }
  })
}

async function testModelsEndpoint(
  target: AdminConnectionTestTarget,
  apiUrl: string,
  apiKey: string
): Promise<AdminConnectionTestResult> {
  if (!apiKey) return missingResult(target, 'Required API key is not configured')

  return timedTest(target, async () => {
    const res = await fetch(`${apiUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        httpStatus: res.status,
        message: `Models endpoint failed with HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`,
      }
    }
    return { ok: true, httpStatus: res.status, message: 'Models endpoint responded successfully' }
  })
}

export async function testAdminModelConnection(target: AdminConnectionTestTarget): Promise<AdminConnectionTestResult> {
  if (target.type === 'model') {
    const modelId = MODEL_IDS[target.key]
    if (!modelId) return missingResult(target, `Unknown model key: ${target.key}`)
    const { apiUrl, apiKey } = getChatConfigForModelKey(target.key)
    return testChatCompletion(target, apiUrl, apiKey, modelId)
  }

  if (target.type !== 'service') {
    return missingResult(target, 'Invalid target type')
  }

  switch (target.key) {
    case 'event-generation':
    case 'code-analysis':
      return testChatCompletion(target, getTencentChatApiBase(), getTencentApiKey(), 'minimax-m2.5')
    case 'team-auto-match':
      return testChatCompletion(target, getZenmuxChatApiBase(), getZenmuxApiKey(), 'z-ai/glm-4.5-air')
    case 'image-generation':
      return testModelsEndpoint(
        target,
        (process.env.POE_API_URL || 'https://api.poe.com/v1').replace(/\/+$/, ''),
        process.env.POE_API_KEY || ''
      )
    case 'github-enrichment':
      return timedTest(target, async () => {
        const res = await fetch('https://api.github.com/rate_limit', {
          headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
          signal: AbortSignal.timeout(10_000),
        })
        return {
          ok: res.ok,
          httpStatus: res.status,
          message: res.ok
            ? 'GitHub API responded successfully'
            : `GitHub API failed with HTTP ${res.status}`,
        }
      })
    case 'web3insight':
      if (!process.env.WEB3INSIGHT_TOKEN) return missingResult(target, 'WEB3INSIGHT_TOKEN is not configured')
      return timedTest(target, async () => {
        const res = await fetch('https://api.web3insight.ai/v1/external/github/users/username/torvalds', {
          headers: { Authorization: `Bearer ${process.env.WEB3INSIGHT_TOKEN}` },
          signal: AbortSignal.timeout(15_000),
        })
        const text = res.ok ? '' : await res.text().catch(() => '')
        return {
          ok: res.ok,
          httpStatus: res.status,
          message: res.ok
            ? 'Web3Insight API responded successfully'
            : `Web3Insight API failed with HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`,
        }
      })
    case 'sonar':
      if (!process.env.SONAR_PROXY_URL || !process.env.SONAR_PROXY_SECRET) {
        return missingResult(target, 'SONAR_PROXY_URL and SONAR_PROXY_SECRET are required')
      }
      return timedTest(target, async () => {
        const res = await fetch(`${process.env.SONAR_PROXY_URL!.replace(/\/+$/, '')}/health`, {
          headers: { 'X-Secret': process.env.SONAR_PROXY_SECRET! },
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) return { ok: true, httpStatus: res.status, message: 'Sonar proxy health endpoint responded successfully' }
        return {
          ok: res.status === 404,
          status: res.status === 404 ? 'warning' : 'error',
          httpStatus: res.status,
          message: res.status === 404
            ? 'Sonar proxy is reachable, but no /health endpoint was found'
            : `Sonar proxy health check failed with HTTP ${res.status}`,
        }
      })
    case 'zenmux-vertex':
      return testModelsEndpoint(target, getZenmuxVertexApiBase(), getZenmuxApiKey())
    default:
      return missingResult(target, `Unknown service key: ${target.key}`)
  }
}
