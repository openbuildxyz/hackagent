-- 010_analysis_log.sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS analysis_log jsonb DEFAULT '[]';
