import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const migration = read('supabase/migrations/036_event_co_organizers.sql')
const helper = read('lib/event-access.ts')
const eventRoute = read('app/api/events/[eventId]/route.ts')
const projectRoute = read('app/api/events/[eventId]/projects/[projectId]/route.ts')
const registrationsRoute = read('app/api/events/[eventId]/registrations/[regId]/route.ts')
const teamRoute = read('app/api/teams/[id]/route.ts')
const enqueueRoute = read('app/api/events/[eventId]/enqueue/route.ts')
const adminRoute = read('app/api/admin/users/route.ts')

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.event_co_organizers/)
assert.match(migration, /event_id uuid NOT NULL REFERENCES public\.events\(id\) ON DELETE CASCADE/)
assert.match(migration, /user_id uuid NOT NULL REFERENCES public\.users\(id\) ON DELETE CASCADE/)
assert.match(migration, /role text NOT NULL DEFAULT 'co_organizer'/)
assert.match(migration, /created_at timestamptz NOT NULL DEFAULT now\(\)/)
assert.match(migration, /UNIQUE \(event_id, user_id\)/)

assert.match(helper, /owner OR platform admin OR an event_co_organizers membership/)
assert.match(helper, /event\.user_id === session\.userId/)
assert.match(helper, /hasPlatformAdminRole\(normalizeRoles\(user\?\.role\)\)/)
assert.match(helper, /\.from\('event_co_organizers'\)/)
assert.match(helper, /\.eq\('role', 'co_organizer'\)/)

for (const [name, source] of [
  ['event route', eventRoute],
  ['project route', projectRoute],
  ['registration route', registrationsRoute],
  ['team route', teamRoute],
  ['enqueue route', enqueueRoute],
]) {
  assert.match(source, /event-access/, `${name} must use shared event authorization`)
}

assert.match(adminRoute, /if \(!user\?\.role\?\.includes\('admin'\)\)/, 'platform admin route must remain admin-only')
assert.doesNotMatch(adminRoute, /event_co_organizers/, 'co-organizer membership must not grant platform admin access')

console.log('event co-organizer permission checks passed')
