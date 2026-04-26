-- Agent identity registry: AI agents can register a profile and (optionally) be claimed
-- by a human owner. Registrations reference an agent row when the participant is an agent.

CREATE TABLE IF NOT EXISTS public.agents (
  id                text PRIMARY KEY,
  agent_name        text NOT NULL,
  owner_user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  owner_email       text,
  model             text,
  framework         text,
  capabilities      text[],
  github            text,
  statement         text,
  parent_agent_id   text REFERENCES public.agents(id),
  claim_token_hash  text,
  claim_token_used  boolean DEFAULT false,
  created_at        timestamptz DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS agents_owner_user_id_idx ON public.agents(owner_user_id);
CREATE INDEX IF NOT EXISTS agents_parent_agent_id_idx ON public.agents(parent_agent_id);

ALTER TABLE public.agents DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS is_agent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_id text REFERENCES public.agents(id);

CREATE INDEX IF NOT EXISTS registrations_agent_id_idx ON public.registrations(agent_id);
