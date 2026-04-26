-- HackAgent Panel Review Mode Migration

-- 1. events 表新增 mode 字段
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS mode text DEFAULT 'ai_only';
COMMENT ON COLUMN public.events.mode IS 'ai_only: AI auto review only, panel_review: multi-reviewer mode';

-- 2. 评委表
CREATE TABLE IF NOT EXISTS public.event_reviewers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  invited_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);
COMMENT ON TABLE public.event_reviewers IS 'Reviewers invited to panel review events';

-- 3. 评委评审记录表
CREATE TABLE IF NOT EXISTS public.reviewer_scores (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  reviewer_id uuid REFERENCES public.users(id) NOT NULL,
  model text NOT NULL,
  dimension_prompt text,
  ai_dimension_scores jsonb,
  ai_overall_score float,
  ai_comment text,
  final_dimension_scores jsonb,
  final_overall_score float,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id, project_id, reviewer_id)
);
COMMENT ON TABLE public.reviewer_scores IS 'Individual reviewer scores per project';

-- 4. scores 表新增 final 字段（单一模式管理员改分用）
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS final_dimension_scores jsonb;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS final_overall_score float;
COMMENT ON COLUMN public.scores.final_dimension_scores IS 'Admin override of AI scores';
COMMENT ON COLUMN public.scores.final_overall_score IS 'Final calculated score after admin override';

-- 5. invite_codes 新增 event_id 和 role（评委邀请码绑定 event）
ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id);
ALTER TABLE public.invite_codes ADD COLUMN IF NOT EXISTS role text DEFAULT 'admin';
COMMENT ON COLUMN public.invite_codes.event_id IS 'If set, invite code binds to specific event';
COMMENT ON COLUMN public.invite_codes.role IS 'admin: regular user, reviewer: event reviewer';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_event_reviewers_event_id ON public.event_reviewers(event_id);
CREATE INDEX IF NOT EXISTS idx_reviewer_scores_event_project ON public.reviewer_scores(event_id, project_id);
CREATE INDEX IF NOT EXISTS idx_reviewer_scores_reviewer_id ON public.reviewer_scores(reviewer_id);
