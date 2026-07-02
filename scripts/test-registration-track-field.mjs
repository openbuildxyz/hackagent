import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const newEventForm = read('app/(dashboard)/events/new/NewEventForm.tsx')
const newTemplatesStart = newEventForm.indexOf('const FIELD_TEMPLATES')
const newTemplatesEnd = newEventForm.indexOf('interface Dimension', newTemplatesStart)
const newTemplates = newEventForm.slice(newTemplatesStart, newTemplatesEnd)

assert.doesNotMatch(newTemplates, /参赛赛道|en: 'Track'|dynamicOptions: 'tracks'/, 'new event quick-add templates do not include a track field')
assert.match(newEventForm, /key: 'track_id'[\s\S]*default: true/, 'new event form still adds canonical track_id when tracks exist')

const editEventForm = read('app/(dashboard)/events/[id]/edit/page.tsx')
const editTemplatesStart = editEventForm.indexOf('const FIELD_TEMPLATES')
const editTemplatesEnd = editEventForm.indexOf('function genTrackId', editTemplatesStart)
const editTemplates = editEventForm.slice(editTemplatesStart, editTemplatesEnd)

assert.doesNotMatch(editTemplates, /field\.template\.track|dynamicOptions: 'tracks'/, 'edit event quick-add templates do not include a track field')
assert.match(editEventForm, /key: 'track_id'[\s\S]*default: true/, 'edit event form still adds canonical track_id when tracks exist')

const registrationForm = read('components/EventRegistrationForm.tsx')
assert.match(registrationForm, /function isTrackLikeCustomField/, 'registration form detects track-like custom fields')
assert.match(registrationForm, /label === 'track' \|\| label === '参赛赛道'/, 'registration form ignores custom fields labeled Track or 参赛赛道')
assert.match(registrationForm, /function getRegistrationFields/, 'registration form normalizes fields before use')
assert.match(registrationForm, /if \(field\.key === 'track_id'\)[\s\S]*if \(sawTrackId\) return false/, 'registration form renders only one canonical track_id field')
assert.match(registrationForm, /const fields = getRegistrationFields\(eventConfig\.registration_config\?\.fields \?\? \[\]\)/, 'submission uses normalized registration fields')
assert.match(registrationForm, /const fields = getRegistrationFields\(config\?\.fields \?\? \[\]\)/, 'rendering uses normalized registration fields')

console.log('registration track field checks passed')
