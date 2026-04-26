-- Add voter_user_id to public_votes for login-based voting
-- voter_fingerprint is kept to avoid breaking existing data

ALTER TABLE public.public_votes
  ADD COLUMN IF NOT EXISTS voter_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_votes_user
  ON public.public_votes(event_id, project_id, voter_user_id)
  WHERE voter_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_votes_event_user
  ON public.public_votes(event_id, voter_user_id)
  WHERE voter_user_id IS NOT NULL;
