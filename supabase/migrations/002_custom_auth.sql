-- Drop old profiles table if exists, create new users table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  password_hash text not null,
  credits integer default 200,
  email_verified boolean default false,
  verify_token text,
  verify_expires_at timestamptz,
  invite_code_used text,
  created_at timestamptz default now()
);

-- Update events, projects foreign key to reference public.users instead of auth.users
-- (add user_id as text/uuid column that references public.users)
alter table public.events drop constraint if exists events_user_id_fkey;
alter table public.events add constraint events_user_id_fkey foreign key (user_id) references public.users(id);

-- RLS: disable for now (we use service role in API)
alter table public.users disable row level security;
alter table public.events disable row level security;
alter table public.projects disable row level security;
alter table public.scores disable row level security;
