create extension if not exists pgcrypto;

create table if not exists public.task_board_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default '',
  position double precision not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_task_board_columns_project_position
  on public.task_board_columns(project_id, position);

create index if not exists idx_task_board_columns_user_project
  on public.task_board_columns(user_id, project_id);

alter table public.task_board_columns enable row level security;

drop policy if exists "task_board_columns_select_visible" on public.task_board_columns;
create policy "task_board_columns_select_visible"
  on public.task_board_columns
  for select
  using (public.can_access_project(project_id, auth.uid()));

drop policy if exists "task_board_columns_insert_visible" on public.task_board_columns;
create policy "task_board_columns_insert_visible"
  on public.task_board_columns
  for insert
  with check (
    auth.uid() = user_id
    and public.can_access_project(project_id, auth.uid())
  );

drop policy if exists "task_board_columns_update_visible" on public.task_board_columns;
create policy "task_board_columns_update_visible"
  on public.task_board_columns
  for update
  using (public.can_access_project(project_id, auth.uid()))
  with check (
    auth.uid() = user_id
    and public.can_access_project(project_id, auth.uid())
  );

drop policy if exists "task_board_columns_delete_visible" on public.task_board_columns;
create policy "task_board_columns_delete_visible"
  on public.task_board_columns
  for delete
  using (public.can_access_project(project_id, auth.uid()));

alter table public.manual_todos
  add column if not exists description text not null default '',
  add column if not exists kanban_column_id uuid null references public.task_board_columns(id) on delete set null,
  add column if not exists kanban_position double precision not null default 0;

create index if not exists idx_manual_todos_project_kanban
  on public.manual_todos(project_id, kanban_column_id, kanban_position);
