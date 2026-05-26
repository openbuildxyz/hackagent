type ChatProvider = 'zenmux' | 'gpt' | 'tencent'

const DEFAULT_CHAT_API_BASE = 'https://zenmux.ai/api/v1'
const DEFAULT_VERTEX_API_BASE = 'https://zenmux.ai/api/vertex-ai'
const DEFAULT_TENCENT_API_BASE = 'https://api.lkeap.cloud.tencent.com/plan/v3'
const DEFAULT_GPT_API_BASE = 'https://router.ianxu.me/v1'

// Tencent LKEAP hosts minimax/kimi/glm (unprefixed model ids). deepseek + claude
// + gemini stay on ZenMux pay-as-you-go; gpt4o on the gpt router.
const TENCENT_MODEL_KEYS = new Set(['minimax', 'kimi', 'glm'])
const GPT_MODEL_KEYS = new Set(['gpt4o'])

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

export function getTencentApiKey(): string {
  return process.env.TENCENT_MODEL_API_KEY || ''
}

export function getTencentChatApiBase(): string {
  return cleanBaseUrl(process.env.TENCENT_MODEL_API_URL || DEFAULT_TENCENT_API_BASE)
}

export function getGptApiKey(): string {
  return process.env.GPT_MODEL_API_KEY || ''
}

export function getGptChatApiBase(): string {
  return cleanBaseUrl(process.env.GPT_MODEL_API_URL || DEFAULT_GPT_API_BASE)
}

export function getChatProviderForModelKey(modelKey: string): ChatProvider {
  if (TENCENT_MODEL_KEYS.has(modelKey)) return 'tencent'
  if (GPT_MODEL_KEYS.has(modelKey)) return 'gpt'
  return 'zenmux'
}

export function getChatConfigForModelKey(modelKey: string): { apiUrl: string; apiKey: string; provider: ChatProvider } {
  const provider = getChatProviderForModelKey(modelKey)
  if (provider === 'tencent') {
    return { provider, apiUrl: getTencentChatApiBase(), apiKey: getTencentApiKey() }
  }
  if (provider === 'gpt') {
    return { provider, apiUrl: getGptChatApiBase(), apiKey: getGptApiKey() }
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
  // Kimi K2.5 (Tencent LKEAP, reasoning model) only reliably accepts temperature 1.
  if (modelId === 'kimi-k2.5') return 1
  return preferred
}
