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

const publicDetail = read('app/(public)/events/public/[eventId]/EventDetailClient.tsx')
assert.doesNotMatch(publicDetail, /<EventRegistrationForm\b/, 'public event detail does not embed the registration form')
assert.match(publicDetail, /href=\{applyHref\}/, 'public event detail sends applicants to the dedicated apply page')
assert.match(publicDetail, /<EventStatusStepper status=\{event\.status\} hideDraft/, 'public event progress hides draft state')

const registrationForm = read('components/EventRegistrationForm.tsx')
assert.doesNotMatch(registrationForm, /fields\.length.*报名字段|registration \$\{fields\.length === 1 \? 'field' : 'fields'\}/s, 'registration form does not show raw field counts')

const zh = read('lib/i18n/zh.ts')
const en = read('lib/i18n/en.ts')
assert.match(zh, /没有邀请码也可以直接注册/, 'zh copy explains open signup')
assert.match(en, /sign up without an invite code/i, 'en copy explains open signup')
assert.match(zh, /'reg\.manage\.approveSuccess': '已通过'/, 'zh approval copy no longer says project was created')
assert.match(en, /'reg\.manage\.approveSuccess': 'Approved'/, 'en approval copy no longer says project was created')

const skillMd = read('app/api/v1/skill.md/route.ts')
assert.doesNotMatch(skillMd, /invite-only/i, 'agent skill docs no longer claim invite-only signup')

console.log('open signup and pre-registration checks passed')
