-- 018_status_v1_1.sql
-- OPE-100: Status Machine v1.1 — add cancelled state support
-- State flow: draft → recruiting → hacking → judging → done
--                                                     ↘ cancelled (from any non-terminal)

ALTER TABLE events ADD COLUMN IF NOT EXISTS judging_end TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
UPDATE events SET status = 'draft' WHERE status IS NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.events.judging_end IS 'When judging phase ends; used by cron to auto-transition judging→done';
COMMENT ON COLUMN public.events.cancelled_at IS 'Timestamp when the event was cancelled';
COMMENT ON COLUMN public.events.cancelled_reason IS 'Optional reason provided by the organizer for cancellation';
