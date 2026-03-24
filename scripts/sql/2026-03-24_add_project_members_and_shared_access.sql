-- Shared project access MVP:
-- - adds project_members (owner + one collaborator)
-- - tracks projects.version in repo for optimistic locking
-- - extends projects/manual_todos RLS for secure shared access

begin;

create extension if not exists pgcrypto;

alter table public.projects
  add column if not exists version bigint not null default 1;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'version'
  ) then
    execute 'update public.projects set version = 1 where version is null';
    execute 'alter table public.projects alter column version set default 1';
    execute 'alter table public.projects alter column version set not null';
  end if;
end
$$;

create or replace function public.bump_projects_version()
returns trigger
language plpgsql
as $$
begin
  new.version := coalesce(old.version, 1) + 1;
  return new;
end;
$$;

drop trigger if exists trg_projects_bump_version on public.projects;
create trigger trg_projects_bump_version
before update on public.projects
for each row
execute function public.bump_projects_version();

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_email text not null,
  role text not null default 'editor' check (role in ('editor')),
  invited_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (member_email = lower(btrim(member_email)))
);

create unique index if not exists idx_project_members_one_collaborator_per_project
  on public.project_members(project_id);

create unique index if not exists idx_project_members_project_user
  on public.project_members(project_id, user_id);

create index if not exists idx_project_members_user_project
  on public.project_members(user_id, project_id);

create or replace function public.project_owner_id(target_project_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.user_id
  from public.projects p
  where p.id = target_project_id
  limit 1
$$;

create or replace function public.is_project_owner(target_project_id uuid, subject_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.project_owner_id(target_project_id) = subject_user, false)
$$;

create or replace function public.is_project_member(target_project_id uuid, subject_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = subject_user
  )
$$;

create or replace function public.can_access_project(target_project_id uuid, subject_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(subject_user is not null, false)
    and (
      public.is_project_owner(target_project_id, subject_user)
      or public.is_project_member(target_project_id, subject_user)
    )
$$;

create or replace function public.can_write_project(target_project_id uuid, new_owner_id uuid, subject_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    case
      when subject_user is null then false
      when target_project_id is null then new_owner_id = subject_user
      else public.can_access_project(target_project_id, subject_user)
        and public.project_owner_id(target_project_id) = new_owner_id
    end
$$;

create or replace function public.can_access_manual_todo(target_project_id uuid, row_user_id uuid, subject_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    case
      when subject_user is null then false
      when target_project_id is null then row_user_id = subject_user
      else public.can_access_project(target_project_id, subject_user)
    end
$$;

create or replace function public.can_insert_manual_todo(target_project_id uuid, row_user_id uuid, subject_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    row_user_id = subject_user
    and (
      target_project_id is null
      or public.can_access_project(target_project_id, subject_user)
    )
$$;

create or replace function public.can_update_manual_todo(
  target_todo_id uuid,
  new_project_id uuid,
  new_user_id uuid,
  subject_user uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  existing_user_id uuid;
  existing_project_id uuid;
begin
  if subject_user is null or target_todo_id is null then
    return false;
  end if;

  select mt.user_id, mt.project_id
  into existing_user_id, existing_project_id
  from public.manual_todos mt
  where mt.id = target_todo_id;

  if not found then
    return false;
  end if;

  if new_user_id is distinct from existing_user_id then
    return false;
  end if;

  if existing_project_id is null then
    return new_user_id = subject_user
      and (
        new_project_id is null
        or public.can_access_project(new_project_id, subject_user)
      );
  end if;

  if existing_user_id = subject_user then
    return new_user_id = subject_user
      and (
        new_project_id is null
        or public.can_access_project(new_project_id, subject_user)
      );
  end if;

  return new_project_id is not null
    and public.can_access_project(new_project_id, subject_user);
end;
$$;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.manual_todos enable row level security;

drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own"
  on public.projects
  for select
  using (public.can_access_project(id, auth.uid()));

create policy "projects_insert_own"
  on public.projects
  for insert
  with check (auth.uid() = user_id);

create policy "projects_update_own"
  on public.projects
  for update
  using (public.can_access_project(id, auth.uid()))
  with check (public.can_write_project(id, user_id, auth.uid()));

create policy "projects_delete_own"
  on public.projects
  for delete
  using (public.is_project_owner(id, auth.uid()));

drop policy if exists "project_members_select_visible" on public.project_members;
drop policy if exists "project_members_insert_owner" on public.project_members;
drop policy if exists "project_members_delete_owner" on public.project_members;

create policy "project_members_select_visible"
  on public.project_members
  for select
  using (
    public.is_project_owner(project_id, auth.uid())
    or user_id = auth.uid()
  );

create policy "project_members_insert_owner"
  on public.project_members
  for insert
  with check (
    public.is_project_owner(project_id, auth.uid())
    and invited_by_user_id = auth.uid()
    and user_id <> auth.uid()
    and member_email = lower(btrim(member_email))
  );

create policy "project_members_delete_owner"
  on public.project_members
  for delete
  using (public.is_project_owner(project_id, auth.uid()));

drop policy if exists "manual_todos_select_own" on public.manual_todos;
drop policy if exists "manual_todos_insert_own" on public.manual_todos;
drop policy if exists "manual_todos_update_own" on public.manual_todos;
drop policy if exists "manual_todos_delete_own" on public.manual_todos;

create policy "manual_todos_select_own"
  on public.manual_todos
  for select
  using (public.can_access_manual_todo(project_id, user_id, auth.uid()));

create policy "manual_todos_insert_own"
  on public.manual_todos
  for insert
  with check (public.can_insert_manual_todo(project_id, user_id, auth.uid()));

create policy "manual_todos_update_own"
  on public.manual_todos
  for update
  using (public.can_access_manual_todo(project_id, user_id, auth.uid()))
  with check (public.can_update_manual_todo(id, project_id, user_id, auth.uid()));

create policy "manual_todos_delete_own"
  on public.manual_todos
  for delete
  using (public.can_access_manual_todo(project_id, user_id, auth.uid()));

create index if not exists idx_projects_user_id
  on public.projects(user_id);

create index if not exists idx_projects_user_updated
  on public.projects(user_id, updated_at desc);

commit;
