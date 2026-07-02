-- Store optional submission-stage metadata without changing the core projects table shape.
-- Used for project_website, demo_video_url, team_size, and future project submit fields.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS extra_fields jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.projects.extra_fields IS 'Optional project submission metadata such as project website, demo video URL, and team size';
