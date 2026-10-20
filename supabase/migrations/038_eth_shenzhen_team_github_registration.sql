-- ETH Shenzhen 2026: collect team name and GitHub at signup (both required).
-- Project details remain on the later project submission form.

UPDATE public.events
SET registration_config = jsonb_set(
  COALESCE(registration_config, '{}'::jsonb),
  '{fields}',
  '[
    {"key":"team_name","label":"团队名称 / Team Name","type":"text","required":true,"default":true},
    {"key":"github_url","label":"GitHub 主页 / GitHub Profile","type":"url","required":true,"default":true}
  ]'::jsonb,
  true
)
WHERE name = 'ETH Shenzhen 2026 Hackathon'
  AND deleted_at IS NULL;
