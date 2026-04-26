#!/usr/bin/env node
/**
 * One-off: append Mantle prize breakdown + timeline to the event description,
 * and set registration_deadline / submission_deadline.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envRaw = readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(envRaw.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1)]
}))
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const EVENT_ID = '7c9c52a8-9ecf-4cf3-8ffd-9f34c4faa183'

const APPEND_MARKER = '<!-- MANTLE_PRIZE_TIMELINE_APPENDED -->'

const APPENDED_HTML = `${APPEND_MARKER}
<hr />
<h3>Prize Breakdown</h3>
<ul>
  <li><strong>Grand Prize:</strong> $30,000</li>
  <li><strong>Track Prize — RWA / RealFi:</strong> $15,000 (1st $10,000 / 2nd $5,000)</li>
  <li><strong>Track Prize — DeFi &amp; Composability:</strong> $15,000</li>
  <li><strong>Track Prize — AI &amp; Oracles:</strong> $15,000</li>
  <li><strong>Track Prize — ZK &amp; Privacy:</strong> $15,000</li>
  <li><strong>Track Prize — Infrastructure &amp; Tooling:</strong> $15,000</li>
  <li><strong>Track Prize — GameFi &amp; Social:</strong> $15,000</li>
  <li><strong>Community Choice:</strong> $6,000</li>
  <li><strong>Best Mantle Integration:</strong> $4,000</li>
  <li><strong>Best UX / Demo:</strong> $5,000</li>
  <li><strong>Incubation Grants:</strong> $15,000</li>
  <li><strong>Total:</strong> $150,000 USDT</li>
</ul>
<hr />
<h3>Timeline</h3>
<ul>
  <li><strong>Registration:</strong> Oct 22, 2025 – Jan 15, 2026</li>
  <li><strong>Submission deadline:</strong> Jan 15, 2026</li>
  <li><strong>Demo Day (Asia):</strong> Feb 3, 2026 19:00–22:00</li>
  <li><strong>Demo Day (Euro):</strong> Feb 4, 2026 22:00 – Feb 5, 01:00</li>
  <li><strong>Reward Announcement:</strong> Feb 7, 2026</li>
</ul>`

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: event, error: readErr } = await supabase
  .from('events')
  .select('id, name, description, registration_deadline, submission_deadline')
  .eq('id', EVENT_ID)
  .single()

if (readErr) {
  console.error('read failed:', readErr)
  process.exit(1)
}

console.log('Event:', event.name)
console.log('Current reg deadline:', event.registration_deadline)
console.log('Current sub deadline:', event.submission_deadline)

const existing = event.description || ''
const alreadyAppended = existing.includes(APPEND_MARKER)
const nextDescription = alreadyAppended ? existing : `${existing.trimEnd()}\n\n${APPENDED_HTML}\n`

const update = {
  description: nextDescription,
  registration_deadline: '2026-01-15T23:59:59+08:00',
  submission_deadline: '2026-01-15T23:59:59+08:00',
}

const { error: updErr } = await supabase
  .from('events')
  .update(update)
  .eq('id', EVENT_ID)

if (updErr) {
  console.error('update failed:', updErr)
  process.exit(1)
}

console.log(alreadyAppended ? 'Description unchanged (marker present); deadlines updated.' : 'Appended prize breakdown + timeline; deadlines updated.')
