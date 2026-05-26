#!/usr/bin/env node
/**
 * HackAgent Analysis Worker
 * Polls analysis_queue, runs project review, writes results back to projects table
 * Run: node worker.js
 * PM2: pm2 start worker.js --name hackagent-worker
 */

import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'https://hackathon.xyz'
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || process.env.WORKER_SECRET
const SONAR_PROXY_URL = cleanEnv(process.env.SONAR_PROXY_URL)
const SONAR_PROXY_SECRET = cleanEnv(process.env.SONAR_PROXY_SECRET)
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '3000')
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '2')
const WORKER_ID = `worker-${process.pid}`
const ZENMUX_COOLDOWN_MS = 5.1 * 60 * 60 * 1000 // 5.1 hours

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !INTERNAL_API_SECRET) {
  throw new Error('Missing required worker env: SUPABASE_URL, SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY, INTERNAL_API_SECRET/WORKER_SECRET')
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

let activeJobs = 0
let zenmuxBlockedUntil = null // Date when Zenmux is available again

function cleanEnv(value) {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '').replace(/\\n$/g, '').trim()
}

function isSonarOnlyRerun(job) {
  return job.run_mode === 'rerun_module' && job.run_module === 'sonar'
}

function safeErrorMessage(err) {
  const msg = err instanceof Error ? err.message : String(err)
  return [SONAR_PROXY_SECRET, INTERNAL_API_SECRET]
    .filter(Boolean)
    .reduce((value, secret) => value.replaceAll(secret, '[redacted]'), msg)
}

function isZenmuxQuotaError(msg) {
  const m = (msg || '').toLowerCase()
  return m.includes('429') || m.includes('quota') || m.includes('rate limit') ||
    m.includes('too many requests') || m.includes('credits') || m.includes('insufficient')
}

function requireSonarConfig() {
  if (!SONAR_PROXY_URL || !SONAR_PROXY_SECRET) {
    throw new Error('SonarQube proxy is not configured for the worker')
  }
  return {
    proxyUrl: SONAR_PROXY_URL.replace(/\/$/, ''),
    secret: SONAR_PROXY_SECRET,
  }
}

async function assertDb(result, action) {
  if (result.error) {
    throw new Error(`${action}: ${result.error.message}`)
  }
  return result.data
}

async function runSonarAnalysis(projectName, githubUrl) {
  const { proxyUrl, secret } = requireSonarConfig()
  try {
    const res = await fetch(`${proxyUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Secret': secret },
      body: JSON.stringify({ name: projectName, github_url: githubUrl }),
      signal: AbortSignal.timeout(360_000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`SonarQube proxy returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 500)}` : ''}`)
    }
    const result = await res.json()
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('SonarQube proxy returned an invalid result')
    }
    return result
  } catch (err) {
    throw new Error(`SonarQube analysis failed: ${safeErrorMessage(err)}`)
  }
}

function buildLastRun(job, timestamp) {
  return {
    mode: job.run_mode,
    module: job.run_module,
    models: Array.isArray(job.models) ? job.models : [],
    triggered_by: 'worker',
    triggered_at: timestamp,
  }
}

async function appendAnalysisLog(projectId, logEntry) {
  const cur = await assertDb(
    await db.from('projects').select('analysis_log').eq('id', projectId).single(),
    'Failed to load project analysis log'
  )
  const existingLog = Array.isArray(cur?.analysis_log) ? cur.analysis_log : []
  await assertDb(
    await db.from('projects').update({ analysis_log: [...existingLog, logEntry] }).eq('id', projectId),
    'Failed to append project analysis log'
  )
}

async function markQueueDone(jobId) {
  await assertDb(
    await db.from('analysis_queue').update({
      status: 'done',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId),
    'Failed to mark analysis queue job done'
  )
}

async function markQueueError(jobId, message) {
  await assertDb(
    await db.from('analysis_queue').update({
      status: 'error',
      error: message,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId),
    'Failed to mark analysis queue job error'
  )
}

async function handleSonarOnlyRerun(job) {
  const startedAt = new Date().toISOString()
  const project = await assertDb(
    await db
      .from('projects')
      .select('id, name, github_url, analysis_result, analysis_modules')
      .eq('id', job.project_id)
      .single(),
    'Failed to load project for SonarQube rerun'
  )
  if (!project) throw new Error('Project not found for SonarQube rerun')
  if (!project.github_url) throw new Error('Project has no GitHub URL for SonarQube analysis')

  const initialModules = project.analysis_modules ?? {}
  await assertDb(
    await db
      .from('projects')
      .update({
        analysis_modules: {
          ...initialModules,
          sonar: { status: 'running', updated_at: startedAt, error: null },
        },
        analysis_last_run: buildLastRun(job, startedAt),
      })
      .eq('id', job.project_id),
    'Failed to mark SonarQube rerun running'
  )

  try {
    const sonarResult = await runSonarAnalysis(project.name, project.github_url)
    const completedAt = new Date().toISOString()
    const modules = {
      ...initialModules,
      sonar: { status: 'completed', updated_at: completedAt, error: null },
    }
    const analysisResult = {
      ...(project.analysis_result ?? {}),
      sonar_analysis: sonarResult,
      analyzed_at: completedAt,
    }
    const logEntry = {
      ts: completedAt,
      status: 'completed',
      mode: job.run_mode,
      module: job.run_module,
      sonar: true,
    }

    await assertDb(
      await db
        .from('projects')
        .update({
          sonar_analysis: sonarResult,
          analysis_result: analysisResult,
          analysis_modules: modules,
          analysis_last_run: buildLastRun(job, completedAt),
        })
        .eq('id', job.project_id),
      'Failed to save SonarQube rerun result'
    )
    await appendAnalysisLog(job.project_id, logEntry)
    await markQueueDone(job.id)
    console.log(`[${new Date().toISOString()}] Done SonarQube rerun job ${job.id}`)
  } catch (err) {
    const message = safeErrorMessage(err)
    const failedAt = new Date().toISOString()
    await assertDb(
      await db
        .from('projects')
        .update({
          analysis_modules: {
            ...initialModules,
            sonar: { status: 'error', updated_at: failedAt, error: message },
          },
          analysis_last_run: buildLastRun(job, failedAt),
        })
        .eq('id', job.project_id),
      'Failed to mark SonarQube rerun error'
    )
    await appendAnalysisLog(job.project_id, {
      ts: failedAt,
      status: 'error',
      mode: job.run_mode,
      module: job.run_module,
      error: message,
    })
    await markQueueError(job.id, message)
    throw new Error(message)
  }
}

async function claimJob() {
  // Claim one pending job atomically
  const { data, error } = await db
    .from('analysis_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (error || !data) return null

  // Try to claim it (race condition: another worker might grab it)
  const { error: claimErr } = await db
    .from('analysis_queue')
    .update({ status: 'running', worker_id: WORKER_ID, started_at: new Date().toISOString() })
    .eq('id', data.id)
    .eq('status', 'pending') // only update if still pending

  if (claimErr) return null

  // Re-fetch to confirm we own it
  const { data: claimed } = await db
    .from('analysis_queue')
    .select('*')
    .eq('id', data.id)
    .eq('worker_id', WORKER_ID)
    .single()

  return claimed || null
}

async function processJob(job) {
  console.log(`[${new Date().toISOString()}] Processing job ${job.id} project=${job.project_id}`)

  if (isSonarOnlyRerun(job)) {
    try {
      await handleSonarOnlyRerun(job)
    } catch (err) {
      const message = safeErrorMessage(err)
      console.error(`[${new Date().toISOString()}] Failed SonarQube rerun job ${job.id}:`, message)
      try {
        await markQueueError(job.id, message)
      } catch (queueErr) {
        console.error(`[${new Date().toISOString()}] Failed to mark SonarQube rerun job ${job.id} error:`, safeErrorMessage(queueErr))
      }
    }
    return
  }

  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/projects/${job.project_id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-user-id': 'worker',
        'x-worker-secret': INTERNAL_API_SECRET,
      },
      body: JSON.stringify({
        models: job.models?.length ? job.models : undefined,
        sonarEnabled: job.sonar_enabled,
        mode: job.run_mode,
        module: job.run_module,
      }),
      signal: AbortSignal.timeout(job.run_module === 'sonar' ? 420_000 : 280_000),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`HTTP ${res.status}: ${err}`)
    }

    const result = await res.json()
    console.log(`[${new Date().toISOString()}] Done job ${job.id}: success=${result.success}`)

    await db.from('analysis_queue').update({
      status: 'done',
      completed_at: new Date().toISOString(),
    }).eq('id', job.id)

  } catch (err) {
    const message = safeErrorMessage(err)
    console.error(`[${new Date().toISOString()}] Failed job ${job.id}:`, message)

    // Detect Zenmux quota exhaustion → cooldown 5.1h, re-queue job
    if (isZenmuxQuotaError(message)) {
      zenmuxBlockedUntil = new Date(Date.now() + ZENMUX_COOLDOWN_MS)
      console.warn(`[${new Date().toISOString()}] ⚠️  Zenmux quota hit! Cooling down until ${zenmuxBlockedUntil.toISOString()}`)
      // Re-queue job back to pending so it retries after cooldown
      await db.from('analysis_queue').update({
        status: 'pending',
        worker_id: null,
        started_at: null,
      }).eq('id', job.id)
      return
    }

    // Write error status back to queue AND project
    await Promise.all([
      db.from('analysis_queue').update({
        status: 'error',
        error: message,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id),
      db.from('projects').update({
        analysis_status: 'error',
      }).eq('id', job.project_id),
    ])
  }
}

async function poll() {
  // Zenmux cooldown check
  if (zenmuxBlockedUntil) {
    if (Date.now() < zenmuxBlockedUntil.getTime()) {
      const remaining = Math.ceil((zenmuxBlockedUntil.getTime() - Date.now()) / 60000)
      if (remaining % 30 === 0) { // log every 30 min to avoid spam
        console.log(`[${new Date().toISOString()}] ⏳ Zenmux cooldown: ${remaining} min remaining`)
      }
      return
    } else {
      console.log(`[${new Date().toISOString()}] ✅ Zenmux cooldown ended, resuming...`)
      zenmuxBlockedUntil = null
    }
  }
  if (activeJobs >= CONCURRENCY) return
  const job = await claimJob()
  if (!job) return

  activeJobs++
  processJob(job).finally(() => { activeJobs-- })
}

console.log(`[${new Date().toISOString()}] HackAgent Analysis Worker starting (${WORKER_ID})`)
console.log(`  API: ${INTERNAL_API_URL}`)
console.log(`  Poll interval: ${POLL_INTERVAL_MS}ms`)
console.log(`  Concurrency: ${CONCURRENCY}`)

setInterval(poll, POLL_INTERVAL_MS)
poll()
