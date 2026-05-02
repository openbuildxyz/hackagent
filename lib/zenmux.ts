const DEFAULT_CHAT_API_BASE = 'https://zenmux.ai/api/v1'
const DEFAULT_VERTEX_API_BASE = 'https://zenmux.ai/api/vertex-ai'

export function getZenmuxApiKey(): string {
  return (
    process.env.ZENMUX_PAY2GO_API_KEY ||
    process.env.ZENMUX_API_KEY ||
    process.env.COMMONSTACK_API_KEY ||
    ''
  )
}

export function getZenmuxChatApiBase(): string {
  return (
    process.env.ZENMUX_PAY2GO_API_URL ||
    process.env.ZENMUX_API_URL ||
    process.env.COMMONSTACK_API_URL ||
    DEFAULT_CHAT_API_BASE
  ).replace(/\/+$/, '')
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
  // Kimi K2.5 currently rejects arbitrary temperature values on ZenMux Pay As You Go.
  // Error observed: "invalid temperature: only 1 is allowed for this model".
  if (modelId === 'moonshotai/kimi-k2.5') return 1
  return preferred
}
