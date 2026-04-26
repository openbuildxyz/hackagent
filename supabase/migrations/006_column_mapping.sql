-- Add column_mapping to events table to persist CSV field mapping
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS column_mapping jsonb;
