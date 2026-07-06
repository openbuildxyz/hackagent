import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const joinRoute = read('app/api/teams/[id]/join/route.ts')
const teamDetailPage = read('app/(dashboard)/events/[id]/teams/[teamId]/page.tsx')

assert.match(
  joinRoute,
  /existingRequest\?\.status === 'pending'/,
  'pending join requests must still block duplicate applications'
)

assert.match(
  joinRoute,
  /existingRequest\?\.status === 'approved'/,
  'approved join requests must still block duplicate applications'
)

assert.match(
  joinRoute,
  /existingRequest\?\.status === 'rejected'/,
  'rejected join requests must be handled explicitly for re-application'
)

assert.match(
  joinRoute,
  /\.update\(\{\s*message:\s*message \|\| null,\s*status:\s*'pending'/s,
  'rejected join requests should be reset to pending with the latest message'
)

assert.doesNotMatch(
  joinRoute,
  /Already have a \$\{existingRequest\.status\} request for this team/,
  'rejected requests must not be blocked by the old generic duplicate request error'
)

assert.match(
  teamDetailPage,
  /myRequest\.status === 'rejected'/,
  'team detail page should show Apply to Join again after a rejected request'
)

assert.match(
  teamDetailPage,
  /\(!myRequest \|\| myRequest\.status === 'rejected'\) && team\.status === 'open' && !isFull/,
  'Apply to Join visibility should allow users with rejected requests to reapply'
)

console.log('team rejected reapply checks passed')
