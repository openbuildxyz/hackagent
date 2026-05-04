import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const component = readFileSync('app/(dashboard)/events/[id]/EventDetailClient.tsx', 'utf8')
const zh = readFileSync('lib/i18n/zh.ts', 'utf8')
const en = readFileSync('lib/i18n/en.ts', 'utf8')

const generateButtonBlock = component.match(/<Button[\s\S]*?onClick=\{handleGenerateBanner\}[\s\S]*?>/)?.[0] ?? ''

assert.match(generateButtonBlock, /type="button"/, 'Generate Banner button must be an explicit non-submit button')
assert.match(generateButtonBlock, /disabled=\{generatingBanner \|\| applyingBanner \|\| bannerUsed >= BANNER_QUOTA\}/, 'Generate Banner button must be disabled while generation is in progress')
assert.match(component, /BANNER_GENERATION_TIMEOUT_MS = 120_000/, 'Banner generation timeout must cover real production image latency')
assert.match(component, /AbortSignal\.timeout\(BANNER_GENERATION_TIMEOUT_MS\)/, 'Banner generation fetch must have a timeout so users can retry after hung requests')
assert.match(component, /event\.banner\.generateFailedRetry/, 'Banner generation failures must use retryable fallback copy')
assert.match(zh, /'event\.banner\.generating': '生成中…\(约 60s\)'/, 'zh generating copy must not promise a 15s completion')
assert.match(en, /'event\.banner\.generating': 'Generating… \(~60s\)'/, 'en generating copy must not promise a 15s completion')
assert.match(zh, /'event\.banner\.generateFailedRetry': '生成失败，请稍后重试'/, 'zh copy must include the required failure sentence')
assert.match(en, /'event\.banner\.generateFailedRetry': 'Generation failed, please try again later'/, 'en copy must include retryable failure copy')

console.log('banner feedback checks passed')
