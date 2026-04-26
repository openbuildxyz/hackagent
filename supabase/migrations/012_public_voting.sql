-- Public voting feature
-- Adds public_vote config to events and a public_votes table

-- Add public_vote jsonb config to events table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS public_vote jsonb DEFAULT NULL;

-- public_votes: one row per (event, project, fingerprint) vote
CREATE TABLE IF NOT EXISTS public.public_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  voted_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_votes_unique
  ON public.public_votes(event_id, project_id, fingerprint);

CREATE INDEX IF NOT EXISTS idx_public_votes_event_fingerprint
  ON public.public_votes(event_id, fingerprint);

CREATE INDEX IF NOT EXISTS idx_public_votes_project
  ON public.public_votes(project_id);

-- Grant access
GRANT ALL ON public.public_votes TO service_role;
GRANT SELECT, INSERT, DELETE ON public.public_votes TO authenticated;
