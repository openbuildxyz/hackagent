#!/usr/bin/env node
/**
 * Rerun failed Mantle scoring using GitHub Copilot gpt-4o
 * Targets 334 projects where all 5 ai_reviews have error:true
 * Writes results back to projects.analysis_result AND scores table
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
// node-fetch not needed, using native fetch (Node 18+)

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const MANTLE_ID = '7c9c52a8-9ecf-4cf3-8ffd-9f34c4faa183'
const COPILOT_TOKEN_PATH = process.env.COPILOT_TOKEN_PATH
const COPILOT_API = 'https://api.githubcopilot.com/chat/completions'
const CONCURRENCY = 3
// Map original model names → real Copilot model ids
const MODEL_MAP = {
  minimax: 'gpt-4o-2024-11-20',       // no minimax in Copilot, use gpt-4o
  gemini: 'gemini-3.1-pro-preview',   // real Gemini
  gpt4o: 'gpt-4o-2024-11-20',         // gpt-5.x doesn't support max_tokens, use gpt-4o
  deepseek: 'claude-sonnet-4',        // use Claude Sonnet 4 as deepseek substitute
  claude: 'claude-sonnet-4.6',        // real Claude
}
const MODEL_NAMES = Object.keys(MODEL_MAP)

const DIMENSIONS = [
  { name: 'Technical Excellence', weight: 25 },
  { name: 'Real-World Applicability', weight: 25 },
  { name: 'User Experience', weight: 20 },
  { name: 'Mantle Integration', weight: 20 },
  { name: 'Long-term Ecosystem Potential', weight: 10 },
]

if (!SUPABASE_URL || !SUPABASE_KEY || !COPILOT_TOKEN_PATH) {
  throw new Error('Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY, COPILOT_TOKEN_PATH')
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY)

function getCopilotToken() {
  const data = JSON.parse(readFileSync(COPILOT_TOKEN_PATH, 'utf8'))
  return data.token
}

function buildPrompt(project) {
  const dimList = DIMENSIONS.map(d => `- ${d.name} (weight ${d.weight}%): score 1-10`).join('\n')
  return `You are a professional hackathon judge. Score this project on each dimension (1-10).

Project: ${project.name}
Description: ${project.description || 'N/A'}
GitHub: ${project.github_url || 'N/A'}
Demo: ${project.demo_url || 'N/A'}

Dimensions:
${dimList}

Respond ONLY with valid JSON in this exact format:
{
  "scores": {
    "Technical Excellence": <number>,
    "Real-World Applicability": <number>,
    "User Experience": <number>,
    "Mantle Integration": <number>,
    "Long-term Ecosystem Potential": <number>
  },
  "overall": <weighted average 1-10>,
  "comment": "<2-3 sentence summary in Chinese>"
}`
}

async function scoreWithCopilot(project, modelName) {
  const token = getCopilotToken()
  const prompt = buildPrompt(project)

  const res = await fetch(COPILOT_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Copilot-Integration-Id': 'vscode-chat',
    },
    body: JSON.stringify({
      model: MODEL_MAP[modelName],
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Copilot API ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || ''

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in response: ${content.slice(0, 100)}`)
  const parsed = JSON.parse(jsonMatch[0])

  return {
    scores: parsed.scores,
    overall: parsed.overall,
    comment: parsed.comment,
  }
}

async function processProject(project) {
  console.log(`  Processing: ${project.name} (${project.id.slice(0, 8)})`)

  // Score with each model name (all using Copilot gpt-4o under the hood)
  const aiReviews = []
  for (const modelName of MODEL_NAMES) {
    try {
      const result = await scoreWithCopilot(project, modelName)
      aiReviews.push({
        model: modelName,
        score: result.overall,
        dimensions: result.scores,
        summary: result.comment,
      })
      // Small delay between model calls to avoid rate limits
      await new Promise(r => setTimeout(r, 800))
    } catch (err) {
      console.error(`    [${modelName}] failed: ${err.message}`)
      aiReviews.push({ model: modelName, score: 0, dimensions: {}, summary: `[ERROR] ${err.message}`, error: true })
    }
  }

  const successCount = aiReviews.filter(r => !r.error).length
  if (successCount === 0) {
    console.error(`    All models failed for ${project.name}`)
    return false
  }

  // Build updated analysis_result
  const existingResult = project.analysis_result || {}
  const updatedResult = {
    ...existingResult,
    ai_reviews: aiReviews,
    analyzed_at: new Date().toISOString(),
  }

  // Update projects table
  await db.from('projects').update({
    analysis_result: updatedResult,
    reviewer_submissions: aiReviews,
    analysis_status: 'completed',
  }).eq('id', project.id)

  // Upsert scores table - delete old error rows first, then insert new
  await db.from('scores').delete().eq('project_id', project.id)

  const scoreRows = aiReviews
    .filter(r => !r.error)
    .map(r => ({
      project_id: project.id,
      model: r.model,
      overall_score: r.score,
      dimension_scores: r.dimensions,
      comment: r.summary,
      status: 'done',
    }))

  if (scoreRows.length > 0) {
    await db.from('scores').insert(scoreRows)
  }

  console.log(`    ✅ ${project.name}: ${successCount}/5 models OK, avg=${(aiReviews.filter(r=>!r.error).reduce((s,r)=>s+r.score,0)/successCount).toFixed(1)}`)
  return true
}

async function main() {
  console.log('Fetching failed Mantle projects...')

  const { data: projects } = await db.from('projects')
    .select('id, name, description, github_url, demo_url, analysis_result')
    .eq('event_id', MANTLE_ID)
    .limit(1000)

  // Filter: all 5 ai_reviews have error:true
  const failed = (projects || []).filter(p => {
    const reviews = p.analysis_result?.ai_reviews ?? []
    return reviews.length > 0 && reviews.every(r => r.error)
  })

  console.log(`Found ${failed.length} projects with all-error ai_reviews`)
  if (failed.length === 0) { console.log('Nothing to do.'); return }

  let done = 0, errors = 0
  const startTime = Date.now()

  // Process in batches with concurrency
  for (let i = 0; i < failed.length; i += CONCURRENCY) {
    const batch = failed.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(p => processProject(p).catch(e => {
      console.error(`  [ERROR] ${p.name}: ${e.message}`)
      return false
    })))
    results.forEach(r => r ? done++ : errors++)

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
    const remaining = failed.length - i - batch.length
    const rate = (done + errors) / (elapsed || 1)
    console.log(`Progress: ${done + errors}/${failed.length} | ✅${done} ❌${errors} | ~${Math.ceil(remaining / rate)}s remaining`)

    // Rate limit pause between batches
    if (i + CONCURRENCY < failed.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  const total = ((Date.now() - startTime) / 1000).toFixed(0)
  console.log(`\nDone! ✅${done} success, ❌${errors} failed, ${total}s total`)
}

main().catch(console.error)
