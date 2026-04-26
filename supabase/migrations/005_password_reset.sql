-- Add password reset fields to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reset_token text,
  ADD COLUMN IF NOT EXISTS reset_expires_at timestamptz;
