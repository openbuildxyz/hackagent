-- HackAgent demo seed data.
-- Fake data only. Safe for local/dev environments. Do not run against production.

insert into public.users (id, email, password_hash, credits, email_verified, invite_code_used)
values
  ('00000000-0000-4000-8000-000000000001', 'organizer@example.test', '$2a$10$demo.hash.not.for.login.organizer', 1000, true, 'DEMO-ORGANIZER'),
  ('00000000-0000-4000-8000-000000000002', 'viewer@example.test', '$2a$10$demo.hash.not.for.login.viewer', 200, true, 'DEMO-VIEWER'),
  ('00000000-0000-4000-8000-000000000003', 'reviewer@example.test', '$2a$10$demo.hash.not.for.login.reviewer', 200, true, 'DEMO-REVIEWER'),
  ('00000000-0000-4000-8000-000000000004', 'admin@example.test', '$2a$10$demo.hash.not.for.login.admin', 2000, true, 'DEMO-ADMIN')
on conflict (email) do update set
  credits = excluded.credits,
  email_verified = excluded.email_verified;

insert into public.invite_codes (code, used_by, used_at)
values
  ('DEMO-ORGANIZER', '00000000-0000-4000-8000-000000000001', now()),
  ('DEMO-VIEWER', '00000000-0000-4000-8000-000000000002', now()),
  ('DEMO-REVIEWER', '00000000-0000-4000-8000-000000000003', now()),
  ('DEMO-ADMIN', '00000000-0000-4000-8000-000000000004', now())
on conflict (code) do nothing;

insert into public.events (
  id, user_id, name, track, description, status, mode, web3_enabled, models,
  registration_deadline, submission_deadline, result_announced_at,
  registration_config, is_hidden
)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Demo Recruiting Hackathon', 'AI Agents', 'Fake demo event currently accepting registrations.', 'recruiting', 'ai_only', true, array['claude','gemini'], now() + interval '14 days', now() + interval '30 days', now() + interval '45 days', '{"open": true, "auto_approve": true, "fields": []}'::jsonb, false),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Demo Hacking Sprint', 'Developer Tools', 'Fake demo event in hacking phase.', 'hacking', 'panel_review', false, array['claude'], now() - interval '1 day', now() + interval '7 days', now() + interval '14 days', '{"open": false, "auto_approve": true, "fields": []}'::jsonb, false),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Demo Judging Week', 'Open Source', 'Fake demo event in judging phase.', 'judging', 'panel_review', true, array['claude','deepseek'], now() - interval '14 days', now() - interval '1 day', now() + interval '7 days', '{"open": false, "auto_approve": false, "fields": []}'::jsonb, false),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'Demo Completed Event', 'Infra', 'Fake completed demo event.', 'done', 'ai_only', false, array['claude'], now() - interval '40 days', now() - interval '20 days', now() - interval '7 days', '{"open": false, "auto_approve": true, "fields": []}'::jsonb, false),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'Demo Cancelled Event', 'Security', 'Fake cancelled demo event.', 'cancelled', 'ai_only', false, array['claude'], now() - interval '10 days', now() + interval '3 days', now() + interval '14 days', '{"open": false, "auto_approve": false, "fields": []}'::jsonb, true)
on conflict (id) do update set
  status = excluded.status,
  description = excluded.description,
  registration_config = excluded.registration_config;

insert into public.projects (id, event_id, name, github_url, demo_url, description, team_name, tags, status)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Demo Agent Builder', 'https://github.com/example/demo-agent-builder', 'https://demo.example.test/agent-builder', 'Fake project for local development.', 'Example Team Alpha', array['ai','agents'], 'submitted'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'Demo Review Copilot', 'https://github.com/example/demo-review-copilot', 'https://demo.example.test/review-copilot', 'Fake judging-phase project.', 'Example Team Beta', array['review','automation'], 'submitted')
on conflict (id) do update set
  description = excluded.description,
  status = excluded.status;

insert into public.scores (project_id, model, dimension_scores, overall_score, comment, status)
values
  ('20000000-0000-4000-8000-000000000001', 'demo-model', '{"Innovation": 8, "Technical Depth": 7, "Completeness": 8}'::jsonb, 7.7, 'Fake score for demo data.', 'done'),
  ('20000000-0000-4000-8000-000000000002', 'demo-model', '{"Innovation": 7, "Technical Depth": 8, "Completeness": 7}'::jsonb, 7.3, 'Fake score for demo data.', 'done');

insert into public.agents (id, agent_name, owner_user_id, owner_email, model, framework, capabilities, github, statement)
values
  ('demo-agent-alpha', 'Demo Agent Alpha', '00000000-0000-4000-8000-000000000001', 'organizer@example.test', 'example/demo-model', 'demo-framework', array['registration','submission'], 'https://github.com/example/demo-agent-alpha', 'Fake demo agent for local development.'),
  ('demo-agent-reviewer', 'Demo Reviewer Agent', '00000000-0000-4000-8000-000000000003', 'reviewer@example.test', 'example/reviewer-model', 'demo-framework', array['review','scoring'], 'https://github.com/example/demo-agent-reviewer', 'Fake reviewer agent for local development.')
on conflict (id) do update set
  agent_name = excluded.agent_name,
  statement = excluded.statement;
