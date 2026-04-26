-- Enable UUID
create extension if not exists "uuid-ossp";

-- Users extended profile
create table public.profiles (
  id uuid references auth.users primary key,
  email text,
  credits integer default 200,
  invite_code text,
  created_at timestamptz default now()
);

-- Invite codes
create table public.invite_codes (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  used_by uuid references auth.users,
  used_at timestamptz,
  created_at timestamptz default now()
);

-- Insert some initial invite codes
insert into public.invite_codes (code) values
  ('HACKAGENT2024'), ('OPENBUILD001'), ('WEB3HACK001'),
  ('TESTINVITE1'), ('TESTINVITE2');

-- Events
create table public.events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  name text not null,
  track text,
  description text,
  dimensions jsonb default '[
    {"name":"创新性","weight":20},
    {"name":"技术深度","weight":20},
    {"name":"完成度","weight":20},
    {"name":"商业价值","weight":20},
    {"name":"团队","weight":20}
  ]'::jsonb,
  web3_enabled boolean default false,
  models text[] default array['claude','minimax'],
  status text default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Projects
create table public.projects (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references public.events not null,
  name text not null,
  github_url text,
  demo_url text,
  description text,
  team_name text,
  tags text[],
  status text default 'pending',
  created_at timestamptz default now()
);

-- Scores
create table public.scores (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.projects not null,
  model text not null,
  dimension_scores jsonb,
  overall_score float,
  comment text,
  web3_insight text,
  status text default 'pending',
  created_at timestamptz default now()
);

-- RLS policies
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.projects enable row level security;
alter table public.scores enable row level security;

create policy "profiles: own" on public.profiles for all using (auth.uid() = id);
create policy "events: own" on public.events for all using (auth.uid() = user_id);
create policy "projects: event owner" on public.projects for all using (
  exists (select 1 from public.events where id = event_id and user_id = auth.uid())
);
create policy "scores: event owner" on public.scores for all using (
  exists (
    select 1 from public.projects p
    join public.events e on e.id = p.event_id
    where p.id = project_id and e.user_id = auth.uid()
  )
);
-- Public read for shared reports
create policy "scores: public read" on public.scores for select using (true);
create policy "projects: public read" on public.projects for select using (true);
create policy "events: public read" on public.events for select using (true);

-- Function to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
