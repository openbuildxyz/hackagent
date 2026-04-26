-- 018_project_team_id.sql
-- Add team_id to projects table to link participant-submitted projects to teams
-- Run manually in Supabase SQL editor

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);

COMMENT ON COLUMN public.projects.team_id IS 'Links a participant-submitted project to their team record';
