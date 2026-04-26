-- HackAgent Status Machine v1.1 Migration
-- Run this in Supabase SQL Editor.
-- 6-state lifecycle: draft → recruiting → hacking → judging → done
--                                                              ↘ cancelled
-- The events.status column is TEXT, so no ALTER TYPE is needed.

ALTER TABLE events ADD COLUMN IF NOT EXISTS judging_end TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
UPDATE events SET status = 'draft' WHERE status IS NULL AND deleted_at IS NULL;
