#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'

const requiredDocs = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/local-development.md',
  'docs/deployment.md',
]

const docs = Object.fromEntries(requiredDocs.map((file) => [file, readFileSync(file, 'utf8')]))

const checks = [
  {
    ok: existsSync('.env.example'),
    message: '.env.example must be committed as the canonical env template',
  },
  {
    ok: docs['README.md'].includes('https://github.com/openbuildxyz/hackagent.git'),
    message: 'README Quick Start must clone https://github.com/openbuildxyz/hackagent.git',
  },
  {
    ok: !docs['README.md'].includes('https://github.com/jueduizone/hackagent.git'),
    message: 'README must not point Quick Start at the old jueduizone/hackagent repo',
  },
  ...requiredDocs.map((file) => ({
    ok: docs[file].includes('.env.example'),
    message: `${file} must use the canonical .env.example template`,
  })),
]

const failed = checks.filter((check) => !check.ok)
if (failed.length) {
  for (const check of failed) console.error(`FAIL: ${check.message}`)
  process.exit(1)
}

console.log('Open-source readiness checks passed')
