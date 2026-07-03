import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const dashboardPage = read('app/(dashboard)/dashboard/page.tsx')
assert.doesNotMatch(
  dashboardPage,
  /from\('registrations'\)[\s\S]{0,260}created_at/,
  'dashboard registration queries must not select/order missing registrations.created_at; use submitted_at'
)
assert.match(
  dashboardPage,
  /submitted_at/,
  'dashboard uses registrations.submitted_at for participant registration ordering'
)

const projectRoute = read('app/api/events/[eventId]/projects/route.ts')
assert.doesNotMatch(
  projectRoute,
  /from\('registrations'\)[\s\S]{0,220}project_id/,
  'participant project submission must not select missing registrations.project_id'
)
assert.doesNotMatch(
  projectRoute,
  /from\('registrations'\)\.update\(\{\s*project_id:/,
  'participant project submission must not update missing registrations.project_id'
)
assert.match(
  projectRoute,
  /\.eq\('registration_id', registration_id\)/,
  'participant project submission checks existing projects by projects.registration_id'
)

console.log('registration schema compatibility checks passed')
