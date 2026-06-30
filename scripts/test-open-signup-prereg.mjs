import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const authRegister = read('app/api/auth/register/route.ts')
assert.doesNotMatch(authRegister, /邀请码必填/, 'account registration no longer requires invite codes')
assert.match(authRegister, /if \(trimmedCode\)/, 'provided invite codes are still validated')
assert.match(authRegister, /if \(codeRow\)/, 'provided invite codes are still marked used')

const loginPage = read('app/(auth)/login/page.tsx')
const inviteIdIndex = loginPage.indexOf('id="invite-code"')
const inviteInputStart = inviteIdIndex >= 0 ? loginPage.lastIndexOf('<Input', inviteIdIndex) : -1
const inviteInputEnd = inviteInputStart >= 0 ? loginPage.indexOf('/>', inviteInputStart) : -1
const inviteInput = inviteInputStart >= 0 && inviteInputEnd >= 0
  ? loginPage.slice(inviteInputStart, inviteInputEnd + 2)
  : ''
assert.ok(inviteInput, 'register form still exposes optional invite code input')
assert.doesNotMatch(inviteInput, /\srequired\b/, 'invite code input is optional in the UI')

const humanRegistration = read('app/api/events/[eventId]/registrations/route.ts')
assert.doesNotMatch(humanRegistration, /from\('projects'\)\.insert/, 'human pre-registration does not create placeholder projects')

const approvalRoute = read('app/api/events/[eventId]/registrations/[regId]/route.ts')
assert.doesNotMatch(approvalRoute, /from\('projects'\)\.insert/, 'approving a pre-registration does not create placeholder projects')
assert.doesNotMatch(approvalRoute, /analysis_queue/, 'approving a pre-registration does not enqueue analysis before project submission')

const submitPage = read('app/apply/[eventId]/submit/page.tsx')
assert.match(submitPage, /track_ids:\s*trackId\s*\?\s*\[trackId\]/, 'project submission preserves selected track as track_ids')

const zh = read('lib/i18n/zh.ts')
const en = read('lib/i18n/en.ts')
assert.match(zh, /没有邀请码也可以直接注册/, 'zh copy explains open signup')
assert.match(en, /sign up without an invite code/i, 'en copy explains open signup')

const skillMd = read('app/api/v1/skill.md/route.ts')
assert.doesNotMatch(skillMd, /invite-only/i, 'agent skill docs no longer claim invite-only signup')

console.log('open signup and pre-registration checks passed')
