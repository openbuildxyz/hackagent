-- Analysis queue: VPS worker polls this table to run analysis tasks
CREATE TABLE IF NOT EXISTS public.analysis_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending / running / done / error
  models text[] DEFAULT '{}',
  sonar_enabled boolean DEFAULT false,
  worker_id text,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_analysis_queue_status ON public.analysis_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_queue_project ON public.analysis_queue(project_id);

-- Grant access
GRANT ALL ON public.analysis_queue TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.analysis_queue TO authenticated;
