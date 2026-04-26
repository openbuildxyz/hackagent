-- Developer Reputation System
-- Run in hackagent Supabase: https://supabase.com/dashboard/project/nofczyucgszztvzaluln/sql/new

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
