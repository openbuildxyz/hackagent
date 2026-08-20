import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const models = read('lib/models.ts')
assert.match(models, /minimax: 'minimax\/minimax-m2\.7'/, 'MiniMax uses its ZenMux model id')
assert.match(models, /gpt4o: 'openai\/gpt-5\.5'/, 'GPT uses its ZenMux model id')
assert.match(models, /kimi: 'kimi-for-coding'/, 'Kimi uses the model exposed by the dedicated API')
assert.match(models, /glm: 'glm-5\.2'/, 'GLM uses the Coding Plan model')

const routing = read('lib/zenmux.ts')
assert.match(routing, /KIMI_MODEL_KEYS = new Set\(\['kimi'\]\)/, 'Kimi has an isolated provider')
assert.match(routing, /GLM_MODEL_KEYS = new Set\(\['glm'\]\)/, 'GLM has an isolated provider')
assert.doesNotMatch(routing, /TENCENT_MODEL_KEYS|GPT_MODEL_KEYS/, 'MiniMax and GPT no longer use legacy providers')
assert.match(routing, /process\.env\.KIMI_MODEL_API_KEY/, 'Kimi reads its dedicated key')
assert.match(routing, /process\.env\.GLM_MODEL_API_KEY/, 'GLM reads its dedicated key')
assert.match(routing, /https:\/\/api\.kimi\.com\/coding\/v1/, 'Kimi uses the coding API endpoint')
assert.match(routing, /https:\/\/open\.bigmodel\.cn\/api\/coding\/paas\/v4/, 'GLM uses the Coding Plan endpoint')

const adminConfig = read('lib/admin-model-config.ts')
assert.match(adminConfig, /provider: 'zenmux',[\s\S]*minimax\/minimax-m2\.7/, 'MiniMax services report ZenMux')
assert.match(adminConfig, /envStatus\('KIMI_MODEL_API_KEY'\)/, 'admin config reports Kimi credentials')
assert.match(adminConfig, /envStatus\('GLM_MODEL_API_KEY'\)/, 'admin config reports GLM credentials')

const csvDetect = read('app/api/csv-detect/route.ts')
assert.match(csvDetect, /const MODEL = MODEL_IDS\.gpt4o/, 'CSV detection reuses the routed GPT model id')

console.log('model provider routing checks passed')
