-- Step 4 migration: add manual ToDo storage to projects.

alter table public.projects
  add column if not exists todos jsonb not null default '[]'::jsonb;
