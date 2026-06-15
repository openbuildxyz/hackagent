import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const permissions = read('lib/permissions.ts')
assert.match(permissions, /export function normalizeRoles/, 'roles are normalized through a shared helper')
assert.match(permissions, /export function canCreateEvents/, 'event creation permission helper exists')
assert.match(permissions, /organizer/, 'organizer role is covered by helper')

const proxy = read('proxy.ts')
assert.match(proxy, /export async function proxy/, 'Next proxy convention is used for request filtering')

const dashboard = read('app/(dashboard)/events/EventsPageClient.tsx')
assert.match(dashboard, /dashboard\.viewerStat\.events/, 'viewer dashboard shows participation stats')
assert.match(dashboard, /href="\/api-keys"/, 'viewer dashboard links to API keys')
assert.match(dashboard, /href="\/my-agents"/, 'viewer dashboard links to agents')
assert.match(dashboard, /href="\/events\/new"/, 'viewer dashboard links to organizer request flow')
assert.match(dashboard, /dashboard\.registration\.approved/, 'registration status is localized')

const newEventPage = read('app/(dashboard)/events/new/page.tsx')
assert.match(newEventPage, /events\.create\.accessRequiredTitle/, 'event creation denial page is localized')
assert.match(newEventPage, /canCreateEvents\(roles\)/, 'event creation page uses shared permission helper')

const registrationAdmin = read('app/(dashboard)/events/[id]/registrations/page.tsx')
assert.match(registrationAdmin, /SheetContent/, 'registration admin has a detail drawer')
assert.match(registrationAdmin, /reg\.manage\.detailTitle/, 'registration detail drawer is localized')
assert.match(registrationAdmin, /exportCsv/, 'registration admin supports CSV export')
assert.match(registrationAdmin, /statusFilter/, 'registration admin supports filters')

const inviteAdmin = read('app/(dashboard)/admin/invite-codes/page.tsx')
assert.match(inviteAdmin, /getOneInviteCode/, 'admin can get one usable invite code')
assert.match(inviteAdmin, /admin\.invites\.getOne/, 'get-one invite action is localized')

const modelAdmin = read('app/(dashboard)/admin/model-config/page.tsx')
assert.match(modelAdmin, /testAllConfigured/, 'model config supports testing all configured targets')
assert.match(modelAdmin, /resultCounts/, 'model config summarizes test results')
assert.match(modelAdmin, /admin\.model\.result\.failed/, 'model test result labels are localized')

const zh = read('lib/i18n/zh.ts')
const en = read('lib/i18n/en.ts')
for (const key of [
  'events.create.accessRequiredTitle',
  'dashboard.viewerStat.events',
  'reg.manage.detailTitle',
  'admin.invites.getOne',
  'admin.model.result.failed',
]) {
  assert.ok(zh.includes(`'${key}'`), `zh contains ${key}`)
  assert.ok(en.includes(`'${key}'`), `en contains ${key}`)
}

console.log('role workflow checks passed')
