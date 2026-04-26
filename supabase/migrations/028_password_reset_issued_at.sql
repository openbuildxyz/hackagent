-- Track when the current reset token was issued so we can short-circuit
-- bursts of forgot-password requests (reuse the still-fresh token instead
-- of rotating it on every hit).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reset_issued_at timestamptz;
