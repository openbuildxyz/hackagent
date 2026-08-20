import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const eventId = process.argv[2]
if (!eventId) throw new Error('Usage: node scripts/run-sonar-event.mjs <event-id>')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const sonarUrl = clean(process.env.SONARQUBE_URL).replace(/\/+$/, '')
const sonarToken = clean(process.env.SONARQUBE_TOKEN)

if (!supabaseUrl || !serviceKey || !sonarUrl || !sonarToken) {
  throw new Error('Missing Supabase or SonarQube environment variables')
}

const db = createClient(supabaseUrl, serviceKey)
const metricKeys = [
  'bugs',
  'vulnerabilities',
  'code_smells',
  'coverage',
  'duplicated_lines_density',
  'reliability_rating',
  'security_rating',
  'sqale_rating',
  'ncloc',
]

function clean(value) {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '').replace(/\\n$/g, '').trim()
}

function githubRepo(value) {
  const url = new URL(value)
  if (url.hostname !== 'github.com') throw new Error('Only github.com repositories are supported')
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new Error('Invalid GitHub repository URL')
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/, '')
  const branch = parts[2] === 'tree' && parts[3] ? parts.slice(3).join('/') : null
  return { cloneUrl: `https://github.com/${owner}/${repo}.git`, branch }
}

function projectKey(projectId) {
  return `hackagent_${eventId.replaceAll('-', '_')}_${projectId.replaceAll('-', '_')}`
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = (chunk) => {
      output = (output + chunk.toString()).slice(-30_000)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`${command} exited ${code}: ${output.slice(-4000)}`))
    })
  })
}

async function sonarJson(endpoint) {
  const auth = Buffer.from(`${sonarToken}:`).toString('base64')
  const response = await fetch(`${sonarUrl}${endpoint}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`SonarQube API ${endpoint} returned HTTP ${response.status}`)
  return response.json()
}

async function loadSonarResult(key) {
  const params = new URLSearchParams({ component: key, metricKeys: metricKeys.join(',') })
  const [measuresBody, gateBody] = await Promise.all([
    sonarJson(`/api/measures/component?${params}`),
    sonarJson(`/api/qualitygates/project_status?projectKey=${encodeURIComponent(key)}`),
  ])
  const measures = Object.fromEntries(
    (measuresBody.component?.measures ?? []).map((item) => [item.metric, item.value])
  )
  const numeric = (keyName) => {
    const value = measures[keyName]
    return value == null || value === '' ? null : Number(value)
  }
  return {
    project_key: key,
    quality_gate: gateBody.projectStatus?.status ?? null,
    bugs: numeric('bugs'),
    vulnerabilities: numeric('vulnerabilities'),
    code_smells: numeric('code_smells'),
    coverage: numeric('coverage'),
    duplicated_lines_density: numeric('duplicated_lines_density'),
    reliability_rating: numeric('reliability_rating'),
    security_rating: numeric('security_rating'),
    maintainability_rating: numeric('sqale_rating'),
    ncloc: numeric('ncloc'),
    analyzed_at: new Date().toISOString(),
  }
}

async function updateQueue(projectId, values) {
  const result = await db
    .from('analysis_queue')
    .update(values)
    .eq('event_id', eventId)
    .eq('project_id', projectId)
    .eq('run_module', 'sonar')
  if (result.error) throw new Error(`Queue update failed: ${result.error.message}`)
}

async function markSuccess(project, sonarResult) {
  const completedAt = new Date().toISOString()
  const analysisResult = { ...(project.analysis_result ?? {}), sonar_analysis: sonarResult, analyzed_at: completedAt }
  const analysisModules = {
    ...(project.analysis_modules ?? {}),
    sonar: { status: 'completed', updated_at: completedAt, error: null },
  }
  const projectUpdate = await db
    .from('projects')
    .update({ sonar_analysis: sonarResult, analysis_result: analysisResult, analysis_modules: analysisModules })
    .eq('id', project.id)
  if (projectUpdate.error) throw new Error(`Project update failed: ${projectUpdate.error.message}`)
  await updateQueue(project.id, { status: 'done', error: null, completed_at: completedAt })
}

async function markFailure(project, error) {
  const failedAt = new Date().toISOString()
  const message = error instanceof Error ? error.message : String(error)
  const analysisModules = {
    ...(project.analysis_modules ?? {}),
    sonar: { status: 'error', updated_at: failedAt, error: message.slice(0, 4000) },
  }
  await db.from('projects').update({ analysis_modules: analysisModules }).eq('id', project.id)
  await updateQueue(project.id, { status: 'error', error: message.slice(0, 4000), completed_at: failedAt })
}

async function scanProject(project, index, total) {
  if (project.sonar_analysis && Object.keys(project.sonar_analysis).length > 0) {
    await updateQueue(project.id, { status: 'done', error: null, completed_at: new Date().toISOString() })
    console.log(`[${index}/${total}] skip ${project.name}: already complete`)
    return true
  }

  console.log(`[${index}/${total}] scan ${project.name}`)
  const workDir = await mkdtemp(path.join(tmpdir(), 'hackagent-sonar-'))
  const repoDir = path.join(workDir, 'repo')
  try {
    const repo = githubRepo(project.github_url)
    const cloneArgs = ['clone', '--depth', '1', '--single-branch']
    if (repo.branch) cloneArgs.push('--branch', repo.branch)
    cloneArgs.push(repo.cloneUrl, repoDir)
    await run('git', cloneArgs)

    const key = projectKey(project.id)
    await run('npx', [
      '-y', '@sonar/scan',
      `-Dsonar.projectKey=${key}`,
      `-Dsonar.projectName=${project.name}`,
      '-Dsonar.sources=.',
      '-Dsonar.sourceEncoding=UTF-8',
      '-Dsonar.scm.disabled=true',
      '-Dsonar.qualitygate.wait=true',
      '-Dsonar.qualitygate.timeout=300',
      '-Dsonar.exclusions=**/.git/**,**/node_modules/**,**/.next/**,**/dist/**,**/build/**,**/vendor/**,**/coverage/**',
    ], { cwd: repoDir, env: { SONAR_HOST_URL: sonarUrl, SONAR_TOKEN: sonarToken } })

    const result = await loadSonarResult(key)
    await markSuccess(project, result)
    console.log(`[${index}/${total}] done ${project.name}: bugs=${result.bugs ?? '-'} vulnerabilities=${result.vulnerabilities ?? '-'} smells=${result.code_smells ?? '-'}`)
    return true
  } catch (error) {
    await markFailure(project, error)
    console.error(`[${index}/${total}] failed ${project.name}: ${error instanceof Error ? error.message.slice(0, 1000) : String(error)}`)
    return false
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

const projectResult = await db
  .from('projects')
  .select('id,name,github_url,sonar_analysis,analysis_result,analysis_modules')
  .eq('event_id', eventId)
  .order('created_at', { ascending: true })
if (projectResult.error) throw new Error(projectResult.error.message)

const allProjects = (projectResult.data ?? []).filter((project) => project.github_url)
const limit = Number.parseInt(process.env.SONAR_SCAN_LIMIT || '0', 10)
const projects = limit > 0 ? allProjects.slice(0, limit) : allProjects
let failures = 0
let nextIndex = 0
const concurrency = Math.max(1, Math.min(4, Number.parseInt(process.env.SONAR_SCAN_CONCURRENCY || '1', 10)))

async function scanNext() {
  while (nextIndex < projects.length) {
    const index = nextIndex
    nextIndex += 1
    const ok = await scanProject(projects[index], index + 1, projects.length)
    if (!ok) failures += 1
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, projects.length) }, () => scanNext()))

console.log(JSON.stringify({ eventId, total: projects.length, completed: projects.length - failures, failed: failures, concurrency }))
if (failures > 0) process.exitCode = 1
