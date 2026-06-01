create extension if not exists pgcrypto;

create table if not exists public.task_card_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete cascade,
  card_key text not null,
  title text not null default 'Checklist',
  position double precision not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_task_card_checklists_project_card_position
  on public.task_card_checklists(project_id, card_key, position);

create index if not exists idx_task_card_checklists_user_card
  on public.task_card_checklists(user_id, card_key);

alter table public.task_card_checklists enable row level security;

drop policy if exists "task_card_checklists_select_visible" on public.task_card_checklists;
create policy "task_card_checklists_select_visible"
  on public.task_card_checklists
  for select
  using (
    (project_id is null and user_id = auth.uid())
    or public.can_access_project(project_id, auth.uid())
  );

drop policy if exists "task_card_checklists_insert_visible" on public.task_card_checklists;
create policy "task_card_checklists_insert_visible"
  on public.task_card_checklists
  for insert
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or public.can_access_project(project_id, auth.uid())
    )
  );

drop policy if exists "task_card_checklists_update_visible" on public.task_card_checklists;
create policy "task_card_checklists_update_visible"
  on public.task_card_checklists
  for update
  using (
    (project_id is null and user_id = auth.uid())
    or public.can_access_project(project_id, auth.uid())
  )
  with check (
    (project_id is null and user_id = auth.uid())
    or public.can_access_project(project_id, auth.uid())
  );

drop policy if exists "task_card_checklists_delete_visible" on public.task_card_checklists;
create policy "task_card_checklists_delete_visible"
  on public.task_card_checklists
  for delete
  using (
    (project_id is null and user_id = auth.uid())
    or public.can_access_project(project_id, auth.uid())
  );

create table if not exists public.task_card_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.task_card_checklists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete cascade,
  title text not null default '',
  checked boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_task_card_checklist_items_checklist_position
  on public.task_card_checklist_items(checklist_id, position);

create index if not exists idx_task_card_checklist_items_project
  on public.task_card_checklist_items(project_id, checklist_id);

create or replace function public.can_access_task_card_checklist_item(
  target_checklist_id uuid,
  target_project_id uuid,
  subject_user uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.task_card_checklists checklist
    where checklist.id = target_checklist_id
      and checklist.project_id is not distinct from target_project_id
      and (
        (checklist.project_id is null and checklist.user_id = subject_user)
        or public.can_access_project(checklist.project_id, subject_user)
      )
  )
$$;

alter table public.task_card_checklist_items enable row level security;

drop policy if exists "task_card_checklist_items_select_visible" on public.task_card_checklist_items;
create policy "task_card_checklist_items_select_visible"
  on public.task_card_checklist_items
  for select
  using (public.can_access_task_card_checklist_item(checklist_id, project_id, auth.uid()));

drop policy if exists "task_card_checklist_items_insert_visible" on public.task_card_checklist_items;
create policy "task_card_checklist_items_insert_visible"
  on public.task_card_checklist_items
  for insert
  with check (
    auth.uid() = user_id
    and public.can_access_task_card_checklist_item(checklist_id, project_id, auth.uid())
  );

drop policy if exists "task_card_checklist_items_update_visible" on public.task_card_checklist_items;
create policy "task_card_checklist_items_update_visible"
  on public.task_card_checklist_items
  for update
  using (public.can_access_task_card_checklist_item(checklist_id, project_id, auth.uid()))
  with check (public.can_access_task_card_checklist_item(checklist_id, project_id, auth.uid()));

drop policy if exists "task_card_checklist_items_delete_visible" on public.task_card_checklist_items;
create policy "task_card_checklist_items_delete_visible"
  on public.task_card_checklist_items
  for delete
  using (public.can_access_task_card_checklist_item(checklist_id, project_id, auth.uid()));
