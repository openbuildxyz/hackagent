# HackAgent Project Memory

## Architecture
- Next.js app with custom auth (Mailgun email verification, JWT session cookie)
- Supabase for database; two clients: `createClient()` (browser) and `createServiceClient()` (server/API routes)
- Auth helper: `getSessionUser()` in `lib/session.ts` — reads `session` cookie, returns `{ userId, ... }` or null
- Database tables: `events`, `projects`, `scores`, `users` (credits stored in `users.credits`)

## API Routes Pattern
- Auth check: `const session = await getSessionUser(); if (!session) return 401`
- DB access: `const db = createServiceClient()`
- See `app/api/review/route.ts` as reference implementation

## Key Files
- `app/api/events/route.ts` — POST create event
- `app/api/events/[eventId]/route.ts` — GET single event (owned by user)
- `app/api/events/[eventId]/credit-check/route.ts` — GET credits/cost info
- `app/api/review/route.ts` — POST start AI review (scores projects, deducts credits)
- `app/api/review/[eventId]/status/route.ts` — GET review progress polling
- `lib/session.ts` — getSessionUser()
- `lib/supabase.ts` — createClient() / createServiceClient()
- `lib/ai.ts` — MODEL_NAMES, MODEL_COLORS, scoreProject()

## Credit Calculation
`cost = ceil(projectCount * (models.length + (web3_enabled ? 0.5 : 0)))`
Credits stored in `users` table (NOT `profiles` — review page previously queried profiles incorrectly).

## Notes
- `app/(dashboard)/events/new/page.tsx` — uses fetch to POST /api/events (no direct supabase client)
- `app/(dashboard)/events/[id]/review/page.tsx` — uses fetch to GET /api/events/[id] and /api/events/[id]/credit-check
