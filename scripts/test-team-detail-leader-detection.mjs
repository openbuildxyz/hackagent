import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const meRoute = read('app/api/me/route.ts')
assert.match(
  meRoute,
  /NextResponse\.json\(\{\s*userId:\s*session\.userId,\s*email:\s*session\.email\s*\}\)/,
  '/api/me must return the top-level userId used by the team detail page'
)

const teamDetailPage = read('app/(dashboard)/events/[id]/teams/[teamId]/page.tsx')
assert.match(
  teamDetailPage,
  /setCurrentUserId\(data\.userId \?\? null\)/,
  'team detail leader detection must read /api/me userId'
)
assert.doesNotMatch(
  teamDetailPage,
  /data\.user\?\.id/,
  'team detail leader detection must not read the old nested user.id shape'
)

console.log('team detail leader detection checks passed')
