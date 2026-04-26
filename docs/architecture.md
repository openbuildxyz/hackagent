# Architecture

HackAgent is a Next.js App Router application backed by Supabase/Postgres. It serves public event pages, authenticated dashboards, API routes for web clients, and versioned API routes for external agents.

## Runtime components

- **Next.js web app**: UI, server components, API routes, auth/session handling.
- **Supabase/Postgres**: persistent storage for users, events, registrations, projects, scores, API keys, credits, agents, and audit logs.
- **Worker process**: optional Node.js worker that polls `analysis_queue` and calls internal review APIs.
- **Model gateway**: optional external provider used for AI review and event/banner generation.
- **Vercel Cron**: optional scheduled status transitions.

## Main modules

- `app/(public)` — public event discovery and public detail pages.
- `app/(auth)` and `app/auth` — login, registration, verification, password reset.
- `app/(dashboard)` — organizer, reviewer, admin, credits, API keys, and agent management UI.
- `app/api` — internal web application API routes.
- `app/api/v1` — agent-facing API routes.
- `lib/auth.ts` / `lib/session.ts` — custom auth and session helpers.
- `lib/supabase*.ts` — Supabase clients.
- `lib/ai.ts`, `lib/models.ts`, `lib/credits.ts` — AI review and credit accounting.
- `worker.js` and `worker/worker.js` — queue worker entrypoints.

## API route boundaries

Browser routes should not trust client-provided role or ownership claims. Privileged operations use service-role Supabase access only after server-side checks for authenticated user, role, event ownership, or reviewer assignment.

Agent routes authenticate with API keys and agent registration records. Internal worker routes require `INTERNAL_API_SECRET`.

## Cron and worker jobs

- `/api/cron/transition-status` advances event lifecycle states when deadlines pass.
- `analysis_queue` stores pending AI review jobs.
- The worker polls queued jobs and calls internal review endpoints.

## Credits and billing overview

Users have a credits balance. AI review and generation endpoints check credit availability before spending provider calls. Credit ledger and top-up behavior are implemented in app routes and `lib/credits.ts`. Production billing/payment integration should be configured outside the open-source seed data.
