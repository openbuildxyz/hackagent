-- Add analysis result fields to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS github_analysis jsonb,
  ADD COLUMN IF NOT EXISTS sonar_analysis jsonb,
  ADD COLUMN IF NOT EXISTS web3_analysis jsonb,
  ADD COLUMN IF NOT EXISTS analysis_status text DEFAULT 'pending'; -- pending/running/done/error

-- Score edits log table
CREATE TABLE IF NOT EXISTS public.score_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  model_key text NOT NULL,
  dimension_name text NOT NULL,
  old_score numeric,
  new_score numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Final submissions by reviewers (panel_review mode)
CREATE TABLE IF NOT EXISTS public.reviewer_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  submission_type text NOT NULL, -- 'single_model' | 'average'
  selected_model text, -- which model (if single_model)
  final_scores jsonb NOT NULL, -- { dimension: score, ... }
  total_score numeric NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, reviewer_id) -- one submission per reviewer per project
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_score_edits_project ON public.score_edits(project_id);
CREATE INDEX IF NOT EXISTS idx_score_edits_reviewer ON public.score_edits(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviewer_submissions_project ON public.reviewer_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_reviewer_submissions_reviewer ON public.reviewer_submissions(reviewer_id);

-- Grants
GRANT ALL ON public.score_edits TO service_role;
GRANT ALL ON public.reviewer_submissions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.score_edits TO authenticated;
GRANT SELECT, INSERT ON public.reviewer_submissions TO authenticated;
