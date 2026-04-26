// Client-safe model constants (no server-side imports)
export const MODEL_NAMES: Record<string, string> = {
  claude: 'Claude Sonnet 4.6',
  minimax: 'MiniMax M2.5',
  gemini: 'Gemini 2.5 Flash',
  gpt4o: 'GPT-4o',
  deepseek: 'DeepSeek V3.2',
  kimi: 'Kimi K2.5',
  glm: 'GLM 5',
}

export const MODEL_COLORS: Record<string, string> = {
  claude: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  minimax: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  gemini: 'bg-green-500/15 text-green-700 dark:text-green-400',
  gpt4o: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  deepseek: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  kimi: 'bg-pink-500/15 text-pink-700 dark:text-pink-400',
  glm: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
}

// Credit multipliers based on per-review cost (3K input + 500 output tokens):
// deepseek $0.0011 (1x baseline), minimax $0.0015 (1x), gemini $0.0022 (2x),
// glm $0.0030 (3x), kimi $0.0033 (3x), gpt4o $0.0125 (12x), claude $0.0165 (16x)
export const MODEL_CREDITS: Record<string, number> = {
  deepseek: 1,
  minimax: 1,
  gemini: 2,
  glm: 3,
  kimi: 3,
  gpt4o: 12,
  claude: 16,
}

export const ALL_MODEL_KEYS: string[] = [
  'deepseek',
  'minimax',
  'gemini',
  'glm',
  'kimi',
  'gpt4o',
  'claude',
]
