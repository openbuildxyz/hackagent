-- Add a first-class track selector to human registrations.
-- Older deployments stored this value in extra_fields.track_id; keep that data.

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS track_id text;

UPDATE public.registrations
SET track_id = NULLIF(extra_fields->>'track_id', '')
WHERE track_id IS NULL
  AND extra_fields IS NOT NULL
  AND extra_fields ? 'track_id';

CREATE INDEX IF NOT EXISTS registrations_event_track_id_idx
  ON public.registrations(event_id, track_id);

NOTIFY pgrst, 'reload schema';
