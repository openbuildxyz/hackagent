import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync, gunzipSync } from 'node:zlib'
import { tsLoader } from './load-ts.mjs'
import { persistedReviewComplete } from '../worker/review-outcome.mjs'

function archive(entries) {
  const parts = []
  for (const [name, content, type = '0'] of entries) {
    const bytes = Buffer.from(content)
    const header = Buffer.alloc(512)
    header.write(name)
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124)
    header.write(type, 156)
    parts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
  }
  parts.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(parts))
}
const fastTimeout = fn => setTimeout(fn, 0)

await test('source URLs preserve refs, including slashes, and reject profile/foreign hosts', () => {
  const { parseGithubReference } = tsLoader()('lib/github-source.ts')
  assert.equal(parseGithubReference('https://github.com/owner/'), null)
  assert.equal(parseGithubReference('https://github.com.evil/owner/repo'), null)
  assert.equal(parseGithubReference('https://github.com/owner/repo.git').repo, 'repo')
  assert.deepEqual(Array.from(parseGithubReference('https://github.com/owner/repo/tree/feature/agents/src').refCandidates), ['feature/agents/src', 'feature/agents', 'feature'])
})

await test('archives preserve submitted branch source even when GitHub metadata is rate limited', async () => {
  const calls = []
  const source = archive([['repo-ref/contracts/src/AgentPolicy.sol', 'contract AgentPolicy {}']])
  const load = tsLoader({ setTimeout: fastTimeout, fetch: async url => {
    calls.push(url)
    if (url.includes('api.github.com')) return new Response('{"message":"API rate limit exceeded"}', { status: 403 })
    if (url.endsWith('feature%2Fagents')) return new Response(source)
    return new Response('Not Found', { status: 404 })
  } })
  const { parseGithubReference, loadGithubSnapshot } = load('lib/github-source.ts')
  const result = await loadGithubSnapshot(parseGithubReference('https://github.com/owner/repo/tree/feature/agents/contracts'))
  assert.equal(result.ref, 'feature/agents')
  assert.equal(result.files[0].content, 'contract AgentPolicy {}')
  assert.equal(result.files[0].path, 'contracts/src/AgentPolicy.sol')
  assert.match(result.metadata.metadata_error, /403.*rate limit/)
  assert.equal(result.digest.length, 64)
  assert.equal(calls.filter(url => url.includes('codeload')).length, 2)
})

await test('tar parser ignores traversal and symlinks and handles long-name/PAX paths', () => {
  const { readTarSource } = tsLoader()('lib/github-source.ts')
  const compressed = archive([['repo/../evil.ts', 'evil'], ['repo/link.ts', 'ignored', '2'], ['long', 'repo/src/business.ts\0', 'L'], ['short', 'export const business = true'], ['pax', '30 path=repo/src/policy.sol\n', 'x'], ['short', 'contract Policy {}']])
  assert.deepEqual(Array.from(readTarSource(gunzipSync(compressed)), file => file.path), ['src/business.ts', 'src/policy.sol'])
})


await test('sampling excludes nested dependency libraries and covers actual implementation', () => {
  const { pickCodeFiles } = tsLoader()('lib/code-analysis.ts')
  const paths = [
    ['contract/lib/forge-std/src/safeconsole.sol', 400000],
    ['contract/lib/openzeppelin-contracts/token/ERC20.sol', 300000],
    ['frontend/node_modules/package/index.js', 200000],
    ['src/latest.ts', 100], ['src/contest.ts', 200],
    ['contracts/src/PolicyVault.sol', 2000], ['contracts/src/AgentRegistry.sol', 1500],
    ['backend/src/routes.ts', 800], ['frontend/app/page.tsx', 900],
    ['contracts/test/Policy.t.sol', 4000], ['src/policy.test.ts', 5000],
  ].map(([path, size]) => ({ path, size, type: 'blob' }))
  const selected = Array.from(pickCodeFiles(paths), file => file.path)
  assert(!selected.some(path => /forge-std|openzeppelin|node_modules|\/test\/|\.test\./.test(path)))
  for (const path of ['contracts/src/PolicyVault.sol', 'backend/src/routes.ts', 'frontend/app/page.tsx', 'src/latest.ts', 'src/contest.ts']) assert(selected.includes(path))
})

await test('non-retryable provider errors retain redacted bodies and do not waste more requests', async () => {
  let requests = 0
  const load = tsLoader({ setTimeout: fastTimeout, process: { env: { ZENMUX_PAY2GO_API_KEY: 'private-test-secret' } }, fetch: async () => {
    requests++
    return new Response('{"error":{"code":"reject_no_credit","message":"private-test-secret"}}', { status: 402 })
  } })
  const { scoreProject } = load('lib/ai.ts')
  await assert.rejects(scoreProject({ name: 'project' }, [{ name: 'technical', weight: 100 }], 'gemini', false), error => {
    assert.match(error.message, /402.*reject_no_credit/)
    assert(!error.message.includes('private-test-secret'))
    return true
  })
  assert.equal(requests, 1)
})

await test('score validation rejects missing dimensions even when overall score exists', async () => {
  let requests = 0
  const load = tsLoader({ setTimeout: fastTimeout, process: { env: { ZENMUX_PAY2GO_API_KEY: 'test-secret-123' } }, fetch: async () => {
    requests++
    return Response.json({ choices: [{ message: { content: JSON.stringify({ scores: {}, overall: 8, comment: 'missing dimension' }) } }] })
  } })
  await assert.rejects(load('lib/ai.ts').scoreProject({ name: 'project' }, [{ name: 'technical', weight: 100 }], 'gemini', false), /Invalid score format/)
  assert.equal(requests, 3)
})

await test('transport loss cannot invalidate complete persisted scores; stale, partial, or failed code cannot pass', () => {
  const job = { models: ['gemini', 'glm'], created_at: '2026-10-11T01:00:00Z' }
  const result = { analyzed_at: '2026-10-11T01:01:00Z', ai_reviews: [
    { model: 'gemini', score: 8 }, { model: 'glm', score: 7 },
  ] }
  assert(persistedReviewComplete({ analysis_status: 'error', analysis_result: result }, job))
  assert(!persistedReviewComplete({ analysis_result: { ...result, analyzed_at: '2026-10-10T01:00:00Z' } }, job))
  assert(!persistedReviewComplete({ analysis_result: { ...result, ai_reviews: result.ai_reviews.slice(0, 1) } }, job))
  assert(!persistedReviewComplete({ analysis_result: { ...result, code_analysis_version: 2, github_analysis: { llm_code_analysis: { llm_error: 'no code' } } } }, job))
  assert(persistedReviewComplete({ analysis_result: { ...result, code_analysis_version: 2, github_analysis: { llm_code_analysis: { sampled_files: ['src/business.ts'], source_digest: 'digest' } } } }, job))
})

await test('rerun progress ignores old model scores from the previous attempt', () => {
  const { computeReviewProgress } = tsLoader()('lib/review-progress.ts')
  const result = computeReviewProgress({ eventStatus: 'judging', modelCount: 2, projects: [
    { id: 'one', analysis_status: 'pending', analysis_result: { analyzed_at: '2026-10-10T01:00:00Z', ai_reviews: [{ score: 8 }, { score: 7 }] } },
  ], queueRows: [{ project_id: 'one', status: 'pending', created_at: '2026-10-11T01:00:00Z' }] })
  assert.equal(result.completed, 0)
  assert.equal(result.active, 1)
  assert.equal(result.done, false)
})

await test('project submission rejects a GitHub profile instead of silently skipping code analysis', () => {
  const { validateProjectInput } = tsLoader()('lib/validate-project.ts')
  const result = validateProjectInput({ name: 'project', description: 'description', github_url: 'https://github.com/hanguo241/' })
  assert.equal(result.ok, false)
  assert.match(result.errors.github_url, /repository.*profile/)
})


await test('progress requires the configured model identities, not duplicate or unrelated scores', () => {
  const { computeReviewProgress } = tsLoader()('lib/review-progress.ts')
  const result = computeReviewProgress({ eventStatus: 'judging', modelCount: 2, modelKeys: ['gemini', 'glm'], projects: [
    { id: 'one', analysis_status: 'completed', analysis_result: { ai_reviews: [{ model: 'gemini', score: 8 }, { model: 'gemini', score: 7 }, { model: 'other', score: 9 }] } },
  ], queueRows: [{ project_id: 'one', status: 'running' }] })
  assert.equal(result.completed, 0)
  assert.equal(result.active, 1)
})

await test('streaming archive reader skips large media while keeping business source', async () => {
  const media = 'A'.repeat(3_000_000)
  const source = archive([['repo/public/asset.png', media], ['repo/src/business.ts', 'export const implementation = true']])
  const load = tsLoader({ fetch: async url => url.includes('codeload') ? new Response(source)
    : new Response('{"message":"rate limit"}', { status: 403 }) })
  const api = load('lib/github-source.ts')
  const result = await api.loadGithubSnapshot(api.parseGithubReference('https://github.com/owner/repo'))
  assert.equal(result.files.find(file => file.path.endsWith('asset.png')).content, '')
  assert.equal(result.files.find(file => file.path.endsWith('business.ts')).content, 'export const implementation = true')
})


await test('multi-repository sampling retains backend evidence instead of only frontend files', () => {
  const { pickCodeFiles } = tsLoader()('lib/code-analysis.ts')
  const files = [
    ...Array.from({ length: 10 }, (_, i) => ({ path: `web/src/folder${i}/page.tsx`, size: 50000, type: 'blob', repository: 'web' })),
    { path: 'backend/src/routes.rs', size: 1000, type: 'blob', repository: 'backend' },
    { path: 'backend/src/policy.rs', size: 500, type: 'blob', repository: 'backend' },
    { path: 'admin/src/api.ts', size: 700, type: 'blob', repository: 'admin' },
  ]
  const selected = Array.from(pickCodeFiles(files))
  assert.equal(selected.length, 8)
  assert.equal(selected.filter(file => file.repository === 'backend').length, 2)
  assert(selected.some(file => file.repository === 'admin'))
})
