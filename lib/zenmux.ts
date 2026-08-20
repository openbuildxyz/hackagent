type ChatProvider = 'zenmux' | 'kimi' | 'glm'

const DEFAULT_CHAT_API_BASE = 'https://zenmux.ai/api/v1'
const DEFAULT_VERTEX_API_BASE = 'https://zenmux.ai/api/vertex-ai'
const DEFAULT_KIMI_API_BASE = 'https://api.kimi.com/coding/v1'
const DEFAULT_GLM_API_BASE = 'https://open.bigmodel.cn/api/coding/paas/v4'

// Kimi and GLM use isolated provider credentials. All other review models use
// the shared ZenMux pay-as-you-go gateway.
const KIMI_MODEL_KEYS = new Set(['kimi'])
const GLM_MODEL_KEYS = new Set(['glm'])

function cleanBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

export function getZenmuxApiKey(): string {
  return (
    process.env.ZENMUX_PAY2GO_API_KEY ||
    process.env.ZENMUX_API_KEY ||
    process.env.COMMONSTACK_API_KEY ||
    ''
  )
}

export function getZenmuxChatApiBase(): string {
  return cleanBaseUrl(
    process.env.ZENMUX_PAY2GO_API_URL ||
    process.env.ZENMUX_API_URL ||
    process.env.COMMONSTACK_API_URL ||
    DEFAULT_CHAT_API_BASE
  )
}

export function getKimiApiKey(): string {
  return process.env.KIMI_MODEL_API_KEY || ''
}

export function getKimiChatApiBase(): string {
  return cleanBaseUrl(process.env.KIMI_MODEL_API_URL || DEFAULT_KIMI_API_BASE)
}

export function getGlmApiKey(): string {
  return process.env.GLM_MODEL_API_KEY || ''
}

export function getGlmChatApiBase(): string {
  return cleanBaseUrl(process.env.GLM_MODEL_API_URL || DEFAULT_GLM_API_BASE)
}

export function getChatProviderForModelKey(modelKey: string): ChatProvider {
  if (KIMI_MODEL_KEYS.has(modelKey)) return 'kimi'
  if (GLM_MODEL_KEYS.has(modelKey)) return 'glm'
  return 'zenmux'
}

export function getChatConfigForModelKey(modelKey: string): { apiUrl: string; apiKey: string; provider: ChatProvider } {
  const provider = getChatProviderForModelKey(modelKey)
  if (provider === 'kimi') {
    return { provider, apiUrl: getKimiChatApiBase(), apiKey: getKimiApiKey() }
  }
  if (provider === 'glm') {
    return { provider, apiUrl: getGlmChatApiBase(), apiKey: getGlmApiKey() }
  }
  return { provider, apiUrl: getZenmuxChatApiBase(), apiKey: getZenmuxApiKey() }
}

export function getZenmuxVertexApiBase(): string {
  const configured =
    process.env.ZENMUX_PAY2GO_VERTEX_API_URL ||
    process.env.ZENMUX_VERTEX_API_URL ||
    process.env.ZENMUX_PAY2GO_API_URL ||
    process.env.ZENMUX_API_URL ||
    process.env.COMMONSTACK_API_URL ||
    DEFAULT_VERTEX_API_BASE

  return configured
    .replace(/\/v1\/?$/, '')
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/+$/, '')
    .replace(/\/api$/, '/api/vertex-ai')
}

export function getTemperatureForModel(modelId: string, preferred: number): number {
  // Kimi for Coding only reliably accepts temperature 1.
  if (modelId === 'kimi-for-coding') return 1
  return preferred
}
