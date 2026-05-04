-- 031_event_banner_gen_count.sql
-- Track how many times an event owner has used the AI banner generator.
-- Cap is enforced in app code (POST /api/events/:eventId/generate-banner)
-- to avoid burning Zenmux credits on a single event.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS banner_gen_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.events.banner_gen_count IS
  'Number of AI banner generations consumed for this event (max 3, enforced in app).';
