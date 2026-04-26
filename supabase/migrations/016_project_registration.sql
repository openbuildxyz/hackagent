-- 016_project_registration.sql
-- Add registration_id to projects table to link participant-submitted projects to registrations

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS registration_id uuid REFERENCES public.registrations(id);

COMMENT ON COLUMN public.projects.registration_id IS 'Links a participant-submitted project to their registration record';
