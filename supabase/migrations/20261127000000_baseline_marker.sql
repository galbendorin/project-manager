-- Tracked Supabase migration baseline marker (cutover: 2026-11-27).
--
-- All 63 historical SQL scripts through
-- `scripts/sql/2026-11-23_atomic_recurring_todo_completion.sql` live in
-- `scripts/sql/` and are already applied in production.
-- Never replay legacy `scripts/sql/` scripts as new migrations.
--
-- On existing linked Supabase environments, mark this baseline as applied once:
--   supabase migration repair --status applied 20261127000000

select 1;
