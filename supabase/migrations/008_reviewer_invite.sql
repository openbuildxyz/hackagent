-- 008: reviewer email invite support
-- Allow inviting unregistered users via email

-- Relax NOT NULL on user_id (unregistered invite won't have user_id yet)
ALTER TABLE public.event_reviewers
  ALTER COLUMN user_id DROP NOT NULL;

-- Add invite fields
ALTER TABLE public.event_reviewers
  ADD COLUMN IF NOT EXISTS invite_email text,
  ADD COLUMN IF NOT EXISTS invite_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS invite_status text NOT NULL DEFAULT 'active'; 
  -- invite_status: 'active' (registered user), 'pending' (invite sent), 'accepted' (invite accepted)

-- Index for token lookup
CREATE INDEX IF NOT EXISTS event_reviewers_invite_token_idx ON public.event_reviewers(invite_token);
CREATE INDEX IF NOT EXISTS event_reviewers_invite_email_idx ON public.event_reviewers(invite_email);

-- Unique constraint: one pending invite per email per event
CREATE UNIQUE INDEX IF NOT EXISTS event_reviewers_event_invite_email_key
  ON public.event_reviewers(event_id, invite_email)
  WHERE invite_email IS NOT NULL;
