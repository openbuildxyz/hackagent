import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const route = readFileSync(new URL('../app/api/v1/skill.md/route.ts', import.meta.url), 'utf8')

assert.match(route, /### PATCH \/events\/:id \*\(Auth — Organizer\)\*/, 'documents PATCH /events/:id')
assert.match(route, /### POST \/events\/:id\/publish \*\(Auth — Organizer\)\*/, 'documents POST /events/:id/publish')
assert.match(route, /Status values:.*\\`recruiting\\`/, 'documents recruiting status')
assert.doesNotMatch(route, /Status values:.*\\`open\\`/, 'does not document old open status value')
assert.match(route, /Allowed fields: \\`name\\`, \\`description\\`, \\`tracks\\`, \\`registration_deadline\\`, \\`submission_deadline\\`\./, 'PATCH whitelist matches organizer API contract')
assert.doesNotMatch(route, /Allowed fields:[\s\S]*\\`registration_config\\`/, 'PATCH docs must not include registration_config in whitelist')
assert.match(route, /\\`description\\` ≥ 10 characters/, 'publish docs mention description minimum')
assert.match(route, /At least 1 track defined/, 'publish docs mention track requirement')
assert.match(route, /\\`registration_deadline\\` set and in the future/, 'publish docs mention registration deadline requirement')
assert.match(route, /\\`submission_deadline\\` set and after \\`registration_deadline\\`/, 'publish docs mention submission deadline requirement')

console.log('skill.md docs checks passed')
