ALTER TABLE registrations ADD COLUMN IF NOT EXISTS extra_fields jsonb DEFAULT '{}'::jsonb;
