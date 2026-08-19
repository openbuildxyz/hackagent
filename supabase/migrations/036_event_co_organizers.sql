-- Event-scoped co-organizers.
CREATE TABLE IF NOT EXISTS public.event_co_organizers (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'co_organizer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_co_organizers_user_id_idx
  ON public.event_co_organizers(user_id);

ALTER TABLE public.event_co_organizers ENABLE ROW LEVEL SECURITY;
