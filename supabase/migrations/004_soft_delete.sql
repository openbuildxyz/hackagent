ALTER TABLE public.events ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
COMMENT ON COLUMN public.events.deleted_at IS 'Soft delete timestamp; NULL means active';
CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON public.events(deleted_at) WHERE deleted_at IS NULL;
