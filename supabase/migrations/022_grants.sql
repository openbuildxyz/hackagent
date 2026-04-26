-- Grants & Applications System
-- Run in hackagent Supabase: https://supabase.com/dashboard/project/nofczyucgszztvzaluln/sql/new

-- Developer reputation (re-run if 021 didn't take effect)
CREATE TABLE IF NOT EXISTS public.developer_reputation (
  wallet_address text PRIMARY KEY,
  human_did text,
  email text UNIQUE,
  hackathon_count int DEFAULT 0,
  completion_rate float DEFAULT 0,
  avg_score float DEFAULT 0,
  top_score float DEFAULT 0,
  last_active timestamptz,
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dev_rep_human_did_idx ON public.developer_reputation(human_did) WHERE human_did IS NOT NULL;
CREATE INDEX IF NOT EXISTS dev_rep_email_idx ON public.developer_reputation(email) WHERE email IS NOT NULL;
ALTER TABLE public.developer_reputation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rep public read" ON public.developer_reputation FOR SELECT USING (true);
CREATE POLICY "rep service write" ON public.developer_reputation FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.developer_reputation TO service_role;
GRANT SELECT ON public.developer_reputation TO anon, authenticated;

-- Grants
CREATE TABLE IF NOT EXISTS public.grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  sponsor text,
  reward text,
  deadline timestamptz,
  required_skills text[],
  min_reputation_score float DEFAULT 0,
  status text DEFAULT 'open',  -- open / closed / draft
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grants public read" ON public.grants FOR SELECT USING (true);
CREATE POLICY "grants service write" ON public.grants FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.grants TO service_role;
GRANT SELECT ON public.grants TO anon, authenticated;

-- Grant Applications
CREATE TABLE IF NOT EXISTS public.grant_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES public.grants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  pitch text,
  reputation_snapshot jsonb,
  status text DEFAULT 'pending',  -- pending / approved / rejected
  created_at timestamptz DEFAULT now(),
  UNIQUE(grant_id, user_id)
);

ALTER TABLE public.grant_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applications service write" ON public.grant_applications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "applications owner read" ON public.grant_applications FOR SELECT USING (
  user_id = (SELECT id FROM public.users WHERE id = user_id LIMIT 1)
);
GRANT ALL ON public.grant_applications TO service_role;
GRANT SELECT ON public.grant_applications TO authenticated;

-- Seed one example grant so the API returns real data
INSERT INTO public.grants (title, description, sponsor, reward, deadline, required_skills, min_reputation_score, status)
VALUES (
  'AgentRel Pioneer Grant',
  'Build a Web3 AI Agent that integrates with AgentRel Skills. Submit a working demo with GitHub repo.',
  'OpenBuild',
  '$500 - $2,000 USDC',
  now() + interval '30 days',
  ARRAY['ethereum', 'solana', 'agent'],
  0,
  'open'
) ON CONFLICT DO NOTHING;
