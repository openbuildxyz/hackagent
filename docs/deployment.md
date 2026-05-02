# Deployment

HackAgent is designed for Vercel plus Supabase.

## Supabase

1. Create a Supabase project.
2. Apply `supabase/migrations` in order.
3. Keep the service-role key server-side only.
4. Optionally run `supabase/seed.sql` in non-production environments.

## Vercel

1. Import the repository or link with Vercel CLI.
2. Set environment variables from `.env.example`.
3. Deploy.

```bash
npm install
npm run build
npx vercel --prod
```

## Required production environment variables

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`

Depending on enabled features, also configure:

- `ZENMUX_PAY2GO_API_KEY` (preferred for production), or legacy fallback `ZENMUX_API_KEY` / `COMMONSTACK_API_KEY`
- `MAILGUN_DOMAIN`, `MAILGUN_API_KEY`, `MAIL_FROM`
- `CRON_SECRET`
- `INTERNAL_API_URL`, `INTERNAL_API_SECRET`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `GITHUB_TOKEN`

## Cron

Configure Vercel Cron for:

```text
/api/cron/transition-status
```

Set `CRON_SECRET` and ensure the route verifies it.

## Worker

Run the worker separately if queued AI review is enabled:

```bash
SUPABASE_URL=https://your-project.supabase.co SUPABASE_SERVICE_KEY=your-supabase-service-role-key INTERNAL_API_URL=https://your-domain.example INTERNAL_API_SECRET=replace-with-a-long-random-string node worker.js
```

## Custom domain

Set `NEXT_PUBLIC_APP_URL` to the public domain and configure the same domain in Vercel. Rebuild after changing URL-like env vars because they can be embedded in server-rendered output.

## Security notes

- Never set service-role keys as `NEXT_PUBLIC_*` variables.
- Rotate any key that was ever committed to git history.
- Use fake seed data only outside production.
