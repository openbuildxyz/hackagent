-- 017_event_status.sql
-- Extend event status machine with new intermediate states
-- State flow: draft → open → closed → judging → done
-- Backward-compat: 'reviewing' is treated as equivalent to 'judging' in all API logic

COMMENT ON COLUMN public.events.status IS
  'draft: not yet published | open: registration open | closed: registration closed, submission window | judging: AI/panel review in progress (legacy: reviewing) | done: results published';
