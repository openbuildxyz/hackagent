-- 009: reviewer multi-model scores + custom weights + final submission

-- 1. Change reviewer_scores unique constraint to include model
--    (allows each reviewer to have one score per project per model)
ALTER TABLE public.reviewer_scores
  DROP CONSTRAINT IF EXISTS reviewer_scores_event_id_project_id_reviewer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reviewer_scores_unique_per_model
  ON public.reviewer_scores(event_id, project_id, reviewer_id, model);

-- 2. Per-reviewer custom dimension weights (stored on event_reviewers)
ALTER TABLE public.event_reviewers
  ADD COLUMN IF NOT EXISTS custom_dimension_weights jsonb;

-- 3. Final submission table (locked after submit, one row per reviewer per project)
CREATE TABLE IF NOT EXISTS public.reviewer_final_scores (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  reviewer_id uuid REFERENCES public.users(id) NOT NULL,
  final_dimension_scores jsonb NOT NULL,
  final_overall_score float NOT NULL,
  source text NOT NULL,        -- 'model:claude' | 'average' | 'custom'
  selected_models text[],      -- which models were averaged (if source='average')
  submitted_at timestamptz DEFAULT now(),
  UNIQUE(event_id, project_id, reviewer_id)
);

GRANT ALL ON public.reviewer_final_scores TO anon, authenticated, service_role;
