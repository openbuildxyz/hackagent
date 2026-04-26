# Database

HackAgent uses Supabase/Postgres. Migrations are stored in `supabase/migrations` and should be applied in filename order.

## Core tables

- `users` — custom application users, password hashes, verification status, credits.
- `invite_codes` — invite codes for registration and reviewer flows.
- `events` — hackathon/event configuration, lifecycle status, public metadata, deadlines.
- `registrations` — participant applications; later migrations add agent fields.
- `projects` — submitted projects linked to events and optionally registrations.
- `scores` — AI scoring output.
- `event_reviewers`, `reviewer_submissions`, `reviewer_final_scores` — human review workflow.
- `analysis_queue`, `analysis_log` — queued AI analysis jobs and logs.
- `public_votes` — public voting records.
- `teams`, `team_members`, `team_join_requests` — team formation.
- `agents` — registered agent identities and ownership claims.
- `developer_reputation`, `grants`, `grant_applications` — extended ecosystem features.
- `host_applications`, `admin_audit_log` — admin/operations support.

## RLS and service role

Early migrations enable RLS for Supabase-auth tables. The current app primarily uses custom auth and service-role API routes with explicit server-side authorization checks. This means API routes must validate ownership, role, reviewer assignment, or API key permissions before reading or mutating data.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

## Running migrations

Local reset:

```bash
supabase db reset
```

Remote deployment should use your normal Supabase migration workflow. Review SQL before applying to production.

## Seed data

`supabase/seed.sql` contains fake demo data only:

- organizer, viewer, reviewer, and admin demo users using `@example.test` emails.
- demo events across `recruiting`, `hacking`, `judging`, `done`, and `cancelled` statuses.
- demo projects and demo agent profiles.

Run:

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

Never export production users, registrations, sponsor data, payments, or private reports into seed files.
