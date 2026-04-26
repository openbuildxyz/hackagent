-- 024_host_applications.sql
-- Stores "Apply to host a hackathon" submissions. Beta-phase invite-only signup.

create table if not exists public.host_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  org text not null,
  event_brief text not null,
  expected_size text not null,
  status text not null default 'pending', -- pending | contacted | approved | rejected
  ip inet,
  user_agent text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists host_applications_created_at_idx
  on public.host_applications (created_at desc);
create index if not exists host_applications_status_idx
  on public.host_applications (status);

-- Keep RLS on; only service role writes/reads. Public INSERT goes through our API route.
alter table public.host_applications enable row level security;

-- No policies = nothing allowed for anon/authenticated; service role bypasses RLS.
