-- 018_status_v1_1.sql
-- OPE-100: Status Machine v1.1
-- Public states: draft, upcoming, recruiting, hacking, open, judging, done
-- Back-office terminal state: cancelled

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS judging_end TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

UPDATE public.events SET status = 'recruiting' WHERE status = 'active';
UPDATE public.events SET status = 'hacking' WHERE status = 'closed';
UPDATE public.events SET status = 'judging' WHERE status = 'reviewing';
UPDATE public.events SET status = 'draft' WHERE status IS NULL AND deleted_at IS NULL;

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

CREATE INDEX IF NOT EXISTS submissions_event_id_idx ON public.submissions(event_id);
CREATE INDEX IF NOT EXISTS submissions_project_latest_idx ON public.submissions(project_id, version DESC);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_team_version_uidx
  ON public.submissions(team_id, version)
  WHERE team_id IS NOT NULL;

GRANT ALL ON public.submissions TO service_role;
GRANT SELECT, INSERT ON public.submissions TO authenticated;

COMMENT ON COLUMN public.events.status IS
  'v1.1 statuses: draft | upcoming | recruiting | hacking | open | judging | done | cancelled';
COMMENT ON COLUMN public.events.start_time IS 'Registration start; future start_time derives upcoming state';
COMMENT ON COLUMN public.events.judging_end IS 'When judging phase ends; used by cron to auto-transition judging→done';
COMMENT ON COLUMN public.events.cancelled_at IS 'Timestamp when the event was cancelled';
COMMENT ON COLUMN public.events.cancelled_reason IS 'Optional reason provided by the organizer for cancellation';
COMMENT ON TABLE public.submissions IS 'Versioned project submissions; reviewers should use the highest version per project';
