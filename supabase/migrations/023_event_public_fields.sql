-- 023_event_public_fields.sql
-- Backfill missing event columns that production already has but were never
-- captured as a migration. Pure ALTER TABLE ADD COLUMN IF NOT EXISTS so it is
-- safe to run on both prod (no-op) and a fresh DB (creates the columns).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS registration_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS submission_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS result_announced_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_config jsonb
    DEFAULT '{"open": false, "auto_approve": false, "fields": []}'::jsonb;

COMMENT ON COLUMN public.events.banner_url IS 'Public hero/banner image URL';
COMMENT ON COLUMN public.events.registration_deadline IS 'When registration closes';
COMMENT ON COLUMN public.events.submission_deadline IS 'When project submission closes';
COMMENT ON COLUMN public.events.result_announced_at IS 'When results are announced publicly';
COMMENT ON COLUMN public.events.registration_config IS 'Registration form config: {open, auto_approve, fields[]}';

-- Public listing pages filter on these; index for the common ordered scan.
CREATE INDEX IF NOT EXISTS idx_events_registration_deadline
  ON public.events(registration_deadline)
  WHERE deleted_at IS NULL;
