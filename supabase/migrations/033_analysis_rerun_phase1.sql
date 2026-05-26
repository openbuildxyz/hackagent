-- Phase 1 rerun metadata for project-level module status and queue run scope.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS analysis_modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analysis_last_run jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.analysis_queue
  ADD COLUMN IF NOT EXISTS run_mode text NOT NULL DEFAULT 'fresh',
  ADD COLUMN IF NOT EXISTS run_module text,
  ADD COLUMN IF NOT EXISTS retry_scope text,
  ADD COLUMN IF NOT EXISTS force_reset boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_analysis_queue_run_mode ON public.analysis_queue(run_mode);
