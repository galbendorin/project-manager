-- Step 7 migration: store manual ToDos in a dedicated table (project-linked or "Other").
-- Supports cross-project ToDo views, recurring manual items, and future assignee support.

create extension if not exists pgcrypto;

create table if not exists public.manual_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete cascade,
  title text not null default '',
  due_date date null,
  owner_text text not null default '',
  assignee_user_id uuid null references auth.users(id) on delete set null,
  status text not null default 'Open' check (status in ('Open', 'Done')),
  recurrence jsonb null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_manual_todos_user_created
  on public.manual_todos(user_id, created_at desc);

create index if not exists idx_manual_todos_project_due
  on public.manual_todos(project_id, due_date);

alter table public.manual_todos enable row level security;

drop policy if exists "manual_todos_select_own" on public.manual_todos;
create policy "manual_todos_select_own"
  on public.manual_todos
  for select
  using (auth.uid() = user_id);

drop policy if exists "manual_todos_insert_own" on public.manual_todos;
create policy "manual_todos_insert_own"
  on public.manual_todos
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "manual_todos_update_own" on public.manual_todos;
create policy "manual_todos_update_own"
  on public.manual_todos
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "manual_todos_delete_own" on public.manual_todos;
create policy "manual_todos_delete_own"
  on public.manual_todos
  for delete
  using (auth.uid() = user_id);
