-- 014_multi_track.sql
-- Add tracks (jsonb array) to events, and track_id (text) to projects

ALTER TABLE events ADD COLUMN IF NOT EXISTS tracks jsonb DEFAULT '[]'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS track_id text;
