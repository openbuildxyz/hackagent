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

function isZenmuxQuotaError(msg) {
  const m = (msg || '').toLowerCase()
  return m.includes('429') || m.includes('quota') || m.includes('rate limit') ||
    m.includes('too many requests') || m.includes('credits') || m.includes('insufficient')
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
      }),
      signal: AbortSignal.timeout(280_000),
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
    console.error(`[${new Date().toISOString()}] Failed job ${job.id}:`, err.message)

    // Detect Zenmux quota exhaustion → cooldown 5.1h, re-queue job
    if (isZenmuxQuotaError(err.message)) {
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
        error: err.message,
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
