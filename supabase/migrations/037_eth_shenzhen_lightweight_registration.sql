-- ETH Shenzhen 2026 collects participant registration data at signup.
-- Project details remain on the later project submission form.

UPDATE public.events
SET registration_config = jsonb_set(
  COALESCE(registration_config, '{}'::jsonb),
  '{fields}',
  '[]'::jsonb,
  true
)
WHERE name = 'ETH Shenzhen 2026 Hackathon'
  AND deleted_at IS NULL;
