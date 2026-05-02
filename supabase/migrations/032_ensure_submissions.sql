-- OPE-100 production guard: ensure versioned project submissions exist.
-- Some production databases missed 018_status_v1_1.sql, so keep this migration
-- idempotent and additive.

CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  version int NOT NULL,
  name text NOT NULL,
  github_url text NOT NULL,
  demo_url text,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, version)
);

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS version int,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS github_url text,
  ADD COLUMN IF NOT EXISTS demo_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.submissions
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS submissions_project_version_uidx
  ON public.submissions(project_id, version);
CREATE INDEX IF NOT EXISTS submissions_event_id_idx ON public.submissions(event_id);
CREATE INDEX IF NOT EXISTS submissions_project_latest_idx ON public.submissions(project_id, version DESC);
CREATE INDEX IF NOT EXISTS submissions_team_latest_idx ON public.submissions(team_id, version DESC)
  WHERE team_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS submissions_team_version_uidx
  ON public.submissions(team_id, version)
  WHERE team_id IS NOT NULL;

GRANT ALL ON public.submissions TO service_role;
GRANT SELECT, INSERT ON public.submissions TO authenticated;

COMMENT ON TABLE public.submissions IS 'Versioned project submissions; team submissions use the highest version per team, solo submissions use the highest version per project';
