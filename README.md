# HackAgent

HackAgent is an AI-native hackathon platform for organizers, reviewers, and developer agents. It helps teams publish events, collect registrations and submissions, run AI-assisted reviews, manage reviewer workflows, expose agent-friendly APIs, and publish public reports.

Production demo: https://hackathon.xyz

## Who it is for

- Hackathon organizers who need registration, submission, judging, and public result workflows.
- Review teams that combine human panel review with AI-assisted analysis.
- Developers building agent integrations for hackathon discovery, registration, and submission.
- Teams that want a Next.js + Supabase reference implementation for event operations.

## Core features

- Public event discovery and registration.
- Organizer dashboard for event lifecycle management.
- Project import, submission, scoring, public voting, and reports.
- Reviewer invitation and reviewer-only scoring flows.
- API keys and `/api/v1` routes for agent integrations.
- Credit accounting for AI review usage.
- Optional worker process for queued analysis jobs.

## Tech stack

- Next.js App Router, React, TypeScript
- Tailwind CSS
- Supabase/Postgres
- Vercel
- Optional model gateways for AI review

## Quick start

```bash
git clone https://github.com/jueduizone/hackagent.git
cd hackagent
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

You need your own Supabase project and environment variables before auth and database-backed pages work.

## Local development

```bash
npm run dev        # start local dev server
npm run lint       # run ESLint
npm run typecheck  # run TypeScript checks
npm run build      # production build
```

Optional worker:

```bash
SUPABASE_URL=https://your-project.supabase.co SUPABASE_SERVICE_KEY=your-supabase-service-role-key INTERNAL_API_URL=http://localhost:3000 INTERNAL_API_SECRET=replace-with-a-long-random-string node worker.js
```

## Environment variables

Use `.env.example` as the canonical template. It contains placeholders only.

Minimum local variables:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
JWT_SECRET=replace-with-a-long-random-string
```

Optional integrations include model gateway keys, GitHub token, Upstash Redis, Mailgun, cron secret, and worker credentials. Never commit `.env`, `.env.local`, production secrets, service-role keys, or API tokens.

## Database setup

Migrations live in `supabase/migrations`.

Recommended flow:

```bash
supabase start
supabase db reset
psql "$DATABASE_URL" -f supabase/seed.sql
```

The seed file uses fake `@example.test` users and demo events only. Do not use production data for local development.

See `docs/database.md` for table and migration details.

## Deployment

The hosted app is designed for Vercel plus Supabase.

1. Create a Supabase project.
2. Apply migrations.
3. Set Vercel environment variables from `.env.example`.
4. Deploy with Vercel.
5. Configure cron/worker separately if queued AI analysis is enabled.

See `docs/deployment.md` for details.

## Documentation

- `docs/architecture.md` — system architecture and module boundaries.
- `docs/local-development.md` — local setup flow.
- `docs/database.md` — migrations, tables, RLS, seed.
- `docs/permissions.md` — roles and server-side authorization rules.
- `docs/deployment.md` — Vercel/Supabase deployment.

## Contributing

Read `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and the issue/PR templates before contributing.

## Security

Report vulnerabilities privately. Do not open public issues with exploit details. See `SECURITY.md`.

## License and trademark

Code is licensed under Apache License 2.0. You may use, modify, distribute, and commercialize the code under that license.

The HackAgent name, logo, domains, and official project identity are not licensed for impersonation or misleading commercial promotion. See `TRADEMARK.md`.
