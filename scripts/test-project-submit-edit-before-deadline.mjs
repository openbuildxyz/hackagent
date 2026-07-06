import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const participantRoute = read('app/api/events/[eventId]/projects/route.ts')
const submitPage = read('app/apply/[eventId]/submit/page.tsx')

assert.doesNotMatch(
  participantRoute,
  /Project already submitted|Your team has already submitted a project/,
  'participant project POST must not reject existing submissions before the deadline'
)

assert.doesNotMatch(
  participantRoute,
  /submissionAllowedStatus|Submissions are only accepted during hacking\/open stages/,
  'participant project POST should match the user-facing submit rule: approved registration plus unexpired submission deadline, not hacking/open event status'
)

assert.match(
  participantRoute,
  /submission_deadline[\s\S]*Submission deadline has passed/,
  'participant project POST should still enforce submission_deadline for both submit and edit'
)

assert.match(
  participantRoute,
  /existingProject[\s\S]*?\.update\(\{/,
  'participant project POST should update an existing registration/team project'
)

assert.match(
  participantRoute,
  /recordSubmissionVersion\(db, \{[\s\S]*?projectId: updated\.id/,
  'updating an existing submission should record a new submission version'
)

assert.doesNotMatch(
  participantRoute,
  /\.select\('id, status, team_name,[^']*project_id[^']*'\)/,
  'participant registration lookup must not require registrations.project_id; production schema may not have that compatibility column'
)

assert.doesNotMatch(
  participantRoute,
  /\.from\('registrations'\)\s*\.update\(\{ project_id:/,
  'updating an existing submission must not write registrations.project_id; projects.registration_id/team_id are the source of truth'
)

assert.match(
  submitPage,
  /const isEditing = Boolean\(registration\.project\)/,
  'submit page should enter editing mode when the user already has a project'
)

assert.match(
  submitPage,
  /setName\(project\.name \?\? ''\)[\s\S]*setGithubUrl\(project\.github_url \?\? ''\)[\s\S]*setDescription\(project\.description \?\? ''\)/,
  'submit page should prefill form fields from the existing project'
)

assert.doesNotMatch(
  submitPage,
  /if \(registration\.project \|\| submitted\) \{/,
  'submit page must not replace the form with an already-submitted dead end before the deadline'
)

assert.match(
  submitPage,
  /isEditing \? t\('submit\.updateBtn'\) : t\('submit\.submitBtn'\)/,
  'submit button should distinguish update vs first submission'
)

console.log('project submit edit-before-deadline checks passed')
