begin;

create extension if not exists pgcrypto;

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  start_minutes integer not null check (start_minutes >= 0 and start_minutes < 1440),
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  description text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_time_entries_user_date
  on public.time_entries(user_id, entry_date desc);

create index if not exists idx_time_entries_project_date
  on public.time_entries(project_id, entry_date desc);

create index if not exists idx_time_entries_project_user_date
  on public.time_entries(project_id, user_id, entry_date desc);

create or replace function public.touch_time_entry_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_time_entries_updated_at on public.time_entries;
create trigger trg_time_entries_updated_at
before update on public.time_entries
for each row
execute function public.touch_time_entry_row();

create or replace function public.can_view_time_entry(
  target_project_id uuid,
  row_user_id uuid,
  subject_user uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(subject_user is not null, false)
    and (
      row_user_id = subject_user
      or public.is_project_owner(target_project_id, subject_user)
    )
$$;

create or replace function public.can_write_time_entry(
  target_project_id uuid,
  row_user_id uuid,
  subject_user uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    row_user_id = subject_user
    and public.can_access_project(target_project_id, subject_user)
$$;

alter table public.time_entries enable row level security;

drop policy if exists "time_entries_select_visible" on public.time_entries;
drop policy if exists "time_entries_insert_own" on public.time_entries;
drop policy if exists "time_entries_update_own" on public.time_entries;
drop policy if exists "time_entries_delete_own" on public.time_entries;

create policy "time_entries_select_visible"
  on public.time_entries
  for select
  using (public.can_view_time_entry(project_id, user_id, auth.uid()));

create policy "time_entries_insert_own"
  on public.time_entries
  for insert
  with check (public.can_write_time_entry(project_id, user_id, auth.uid()));

create policy "time_entries_update_own"
  on public.time_entries
  for update
  using (user_id = auth.uid())
  with check (public.can_write_time_entry(project_id, user_id, auth.uid()));

create policy "time_entries_delete_own"
  on public.time_entries
  for delete
  using (user_id = auth.uid());

commit;
