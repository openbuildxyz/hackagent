# Local Development

## Requirements

- Node.js 20+
- npm
- Supabase CLI for local database workflows
- Optional: Docker, psql, gitleaks

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with values from your own Supabase project. The example file contains placeholders only.

## Run the app

```bash
npm run dev
```

Open http://localhost:3000.

## Database

For a local Supabase stack:

```bash
supabase start
supabase db reset
psql "$DATABASE_URL" -f supabase/seed.sql
```

The seed creates fake demo users and events. It does not include real accounts or production data.

## Worker

The worker is optional for local UI development.

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=your-local-service-role-key INTERNAL_API_URL=http://localhost:3000 INTERNAL_API_SECRET=replace-with-a-long-random-string node worker.js
```

## Validation

Before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run build
```

Run secret scanning if you touched env, docs, scripts, or config:

```bash
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --verbose
```
