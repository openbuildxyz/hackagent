#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'

const checks = [
  {
    ok: existsSync('.env.example'),
    message: '.env.example must be committed as the canonical env template',
  },
  {
    ok: readFileSync('README.md', 'utf8').includes('https://github.com/openbuildxyz/hackagent.git'),
    message: 'README Quick Start must clone https://github.com/openbuildxyz/hackagent.git',
  },
  {
    ok: !readFileSync('README.md', 'utf8').includes('https://github.com/jueduizone/hackagent.git'),
    message: 'README must not point Quick Start at the old jueduizone/hackagent repo',
  },
  {
    ok: readFileSync('CONTRIBUTING.md', 'utf8').includes('cp .env.example .env.local'),
    message: 'Contributor setup must use the canonical .env.example template',
  },
]

const failed = checks.filter((check) => !check.ok)
if (failed.length) {
  for (const check of failed) console.error(`FAIL: ${check.message}`)
  process.exit(1)
}

console.log('Open-source readiness checks passed')
