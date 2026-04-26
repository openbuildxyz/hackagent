import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const sql = readFileSync(join(__dirname, '../supabase/migrations/003_panel_review.sql'), 'utf8')

// Split SQL by semicolons and run each statement
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'))

for (const stmt of statements) {
  console.log('Running:', stmt.slice(0, 60) + '...')
  const { error } = await db.rpc('exec_sql', { sql: stmt }).catch(() => ({ error: { message: 'rpc not available' } }))
  if (error) {
    // Try direct REST approach via fetch
    console.log('  (rpc failed, trying direct query)')
  }
}

// Use the REST API directly for DDL statements
const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
  },
  body: JSON.stringify({ sql }),
})

console.log('Response status:', response.status)
const text = await response.text()
console.log('Response:', text.slice(0, 500))
