-- OPE-25: Admin audit log
-- Records all admin write operations (event mutation, registration review,
-- role changes, etc.) for post-hoc forensics and accidental-change recovery.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  action          text NOT NULL,
  target_type     text NOT NULL,
  target_id       text,
  before_data     jsonb,
  after_data      jsonb,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_admin_user_id_idx ON public.admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON public.admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log DISABLE ROW LEVEL SECURITY;
