import assert from 'node:assert/strict'
import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const humanRegistration = read('app/api/events/[eventId]/registrations/route.ts')
assert.doesNotMatch(humanRegistration, /from\('projects'\)\.insert/, 'human registration must not create placeholder projects')
assert.match(humanRegistration, /github_url:\s*github_url \?\? null/, 'registration stores github_url as participant/developer GitHub only')

const agentRegistration = read('app/api/v1/events/[id]/register/route.ts')
assert.doesNotMatch(agentRegistration, /from\('projects'\)\.insert/, 'agent registration auto-approval must not create placeholder projects')
assert.match(agentRegistration, /Registration.*github_url.*participant\/developer GitHub/s, 'agent registration docs/comments distinguish developer GitHub from project repo')

const submitPage = read('app/apply/[eventId]/submit/page.tsx')
assert.match(submitPage, /submit\.projectRepoUrl/, 'project submission form labels github_url as project repository URL')
assert.match(submitPage, /project_website/, 'project submission form collects project website')
assert.match(submitPage, /demo_video_url/, 'project submission form collects demo video URL')
assert.match(submitPage, /team_size/, 'project submission form collects team size')
assert.match(submitPage, /active_team/, 'project submission form surfaces active team context')

const projectRoute = read('app/api/events/[eventId]/projects/route.ts')
assert.match(projectRoute, /buildSubmissionExtraFields/, 'project submission route normalizes submission-only metadata')
assert.match(projectRoute, /project_website/, 'project route stores project website metadata')
assert.match(projectRoute, /demo_video_url/, 'project route stores demo video metadata')
assert.match(projectRoute, /team_size/, 'project route stores team size metadata')
assert.match(projectRoute, /\.eq\('team_id', activeTeamId\)/, 'project route enforces one project per active team')
assert.match(projectRoute, /team_name:\s*activeTeam\?\.name/, 'project route prefers active team name for team submissions')

const myRegistration = read('app/api/events/[eventId]/my-registration/route.ts')
assert.match(myRegistration, /active_team/, 'my-registration returns active team context')
assert.match(myRegistration, /team_id\.eq\.\$\{activeTeamId\}/, 'my-registration finds existing team project by active team')

const migration = read('supabase/migrations/035_projects_extra_fields.sql')
assert.match(migration, /ADD COLUMN IF NOT EXISTS extra_fields jsonb/, 'projects.extra_fields migration exists')

const zh = read('lib/i18n/zh.ts')
assert.match(zh, /开发者 GitHub/, 'Chinese registration copy uses developer GitHub')
assert.match(zh, /开源项目仓库 URL/, 'Chinese submission copy uses project repo URL')
assert.match(zh, /每个团队只能提交一个项目/, 'Chinese copy explains one project per team')

const en = read('lib/i18n/en.ts')
assert.match(en, /Developer GitHub/, 'English registration copy uses developer GitHub')
assert.match(en, /Open-source Project Repository URL/, 'English submission copy uses project repo URL')
assert.match(en, /one project/i, 'English copy explains one project per team')

console.log('registration/submission separation checks passed')
