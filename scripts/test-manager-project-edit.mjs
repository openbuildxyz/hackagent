import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const patchRoute = read('app/api/events/[eventId]/projects/[projectId]/route.ts')
const projectsRoute = read('app/api/events/[eventId]/projects/route.ts')
const eventRoute = read('app/api/events/[eventId]/route.ts')
const table = read('app/(dashboard)/events/[id]/ProjectsTable.tsx')
const eventClient = read('app/(dashboard)/events/[id]/EventDetailClient.tsx')

assert.match(patchRoute, /getSessionUserWithRole/, 'project PATCH must load roles for admin authorization')
assert.match(patchRoute, /getEventManagerAccess/, 'project PATCH must use shared event-manager authorization')
assert.match(patchRoute, /if \(!access\.ok\)/, 'project PATCH must reject users without event-manager access')
assert.match(patchRoute, /const isOwner = access\.isOwner/, 'project PATCH must preserve owner-specific audit behavior')
assert.match(patchRoute, /validateProjectInput\(/, 'project PATCH must use shared project validation')
for (const field of ['name', 'github_url', 'demo_url', 'description', 'team_name']) {
  assert.match(patchRoute, new RegExp(`\\b${field}\\b`), `project PATCH must handle ${field}`)
}
assert.match(patchRoute, /extra_fields/, 'project PATCH must preserve or explicitly carry extra_fields')
assert.match(patchRoute, /track_ids/, 'project PATCH must preserve or explicitly carry tracks')
assert.match(patchRoute, /logo_url/, 'project PATCH must preserve or explicitly carry the logo')

assert.match(eventRoute, /can_manage_projects: true/, 'owners and admins must receive project-management capability')
assert.match(eventRoute, /can_manage_projects: false/, 'reviewers must not receive project-management capability')
assert.match(eventClient, /canManageProjects=\{event\?\.can_manage_projects \?\? false\}/, 'event UI must use server-derived management capability')
assert.match(table, /const canManage = canManageProjects \?\? isOwner/, 'table must distinguish management from reviewer access')
assert.match(table, /\{canManage && \(/, 'manager actions must use management capability')
assert.match(table, /description: p\.description \?\? ''/, 'edit form must prefill the required description')

assert.match(projectsRoute, /if \(event\.status === 'done'\)/, 'destructive project deletion must remain blocked when done')
assert.match(table, /\{canManage && !isDone && \(/, 'destructive toolbar actions must be blocked when done')
assert.match(table, /\{canManage && \(\s*<Button size="icon"/, 'edit action must not be gated by done status')
assert.doesNotMatch(table, /canManage && !isDone[\s\S]{0,500}openEdit\(project\)/, 'edit action must not inherit the destructive done-state guard')

console.log('manager project edit permission checks passed')
