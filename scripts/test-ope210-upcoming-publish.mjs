import fs from 'node:fs'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = fs.readFileSync('lib/event-status.ts', 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const sandbox = { exports: {}, require }
vm.runInNewContext(compiled, sandbox, { filename: 'lib/event-status.ts' })
const { deriveEventStatus, derivePublishStatus } = sandbox.exports

const now = new Date('2026-05-02T00:00:00.000Z')

assert.equal(
  deriveEventStatus({
    status: 'draft',
    registration_open_at: '2026-05-09T00:00:00.000Z',
    registration_deadline: '2026-06-01T00:00:00.000Z',
    submission_deadline: '2026-06-16T00:00:00.000Z',
  }, now),
  'upcoming',
  'future registration_open_at should derive upcoming',
)

assert.equal(
  deriveEventStatus({
    status: 'draft',
    start_time: '2026-05-09T00:00:00.000Z',
    registration_deadline: '2026-06-01T00:00:00.000Z',
    submission_deadline: '2026-06-16T00:00:00.000Z',
  }, now),
  'upcoming',
  'future start_time should still derive upcoming as fallback',
)

assert.equal(
  deriveEventStatus({
    status: 'draft',
    registration_open_at: '2026-05-01T00:00:00.000Z',
    registration_deadline: '2026-06-01T00:00:00.000Z',
    submission_deadline: '2026-06-16T00:00:00.000Z',
  }, now),
  'recruiting',
  'past registration_open_at should derive recruiting',
)

assert.equal(
  derivePublishStatus({
    registration_open_at: '2026-05-09T00:00:00.000Z',
    start_time: null,
  }, now),
  'upcoming',
  'publish with future registration_open_at should enter upcoming',
)

assert.equal(
  derivePublishStatus({
    registration_open_at: null,
    start_time: '2026-05-09T00:00:00.000Z',
  }, now),
  'upcoming',
  'publish with future start_time should enter upcoming as fallback',
)

assert.equal(
  derivePublishStatus({
    registration_open_at: '2026-05-01T00:00:00.000Z',
    start_time: null,
  }, now),
  'recruiting',
  'publish with past registration_open_at should enter recruiting',
)

const createRoute = fs.readFileSync('app/api/v1/events/route.ts', 'utf8')
assert.match(createRoute, /registration_open_at:\s*body\.registration_open_at \?\? null/)
assert.match(createRoute, /start_time:\s*body\.start_time \?\? null/)
assert.match(createRoute, /submission_deadline:\s*body\.submission_deadline \?\? null/)

assert.equal(
  derivePublishStatus({ registration_open_at: '2026-05-09T00:00:00.000Z' }, now),
  'upcoming',
  'publish should use future registration_open_at for upcoming',
)
assert.equal(
  derivePublishStatus({ start_time: '2026-05-09T00:00:00.000Z' }, now),
  'upcoming',
  'publish should fall back to future start_time for upcoming',
)
assert.equal(
  derivePublishStatus({ registration_open_at: '2026-05-01T00:00:00.000Z' }, now),
  'recruiting',
  'publish should derive recruiting after registration_open_at',
)

const publishRoute = fs.readFileSync('app/api/v1/events/[id]/publish/route.ts', 'utf8')
assert.match(publishRoute, /select\('[^']*registration_open_at[^']*start_time[^']*'\)/)
assert.match(publishRoute, /derivePublishStatus\(event\)/)

console.log('OPE-210 upcoming publish regression checks passed')
