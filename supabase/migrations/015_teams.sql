-- 015_teams.sql
-- Team collaboration feature: teams, team_members, team_join_requests

-- Teams table
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  leader_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  max_members int NOT NULL DEFAULT 4,
  skills_needed text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Team members table
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Team join requests table
CREATE TABLE IF NOT EXISTS public.team_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS teams_event_id_idx ON public.teams(event_id);
CREATE INDEX IF NOT EXISTS team_members_team_id_idx ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS team_join_requests_team_id_idx ON public.team_join_requests(team_id);
CREATE INDEX IF NOT EXISTS team_join_requests_user_id_idx ON public.team_join_requests(user_id);

-- RLS (service role bypasses these; included for completeness)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can read teams/members
CREATE POLICY "teams_select_all" ON public.teams FOR SELECT USING (true);
CREATE POLICY "team_members_select_all" ON public.team_members FOR SELECT USING (true);

-- Service role handles writes via API routes (no additional RLS needed for writes
-- since all mutations go through service-role API routes)
