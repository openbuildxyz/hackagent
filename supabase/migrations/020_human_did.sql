-- Add human_did field to projects for Sybil resistance (Billions DID verification)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS human_did text;

-- Also add to registrations if table exists
-- (no-op if column already exists due to IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS projects_human_did_idx ON public.projects(human_did) WHERE human_did IS NOT NULL;
