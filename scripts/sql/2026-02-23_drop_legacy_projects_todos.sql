-- Step 9 migration: remove legacy project-level todos JSON after backfill.
-- Run only after confirming:
-- 1) 2026-02-23_create_manual_todos.sql has been applied
-- 2) 2026-02-23_backfill_manual_todos_from_projects.sql has been applied (if legacy data exists)

alter table public.projects
  drop column if exists todos;
