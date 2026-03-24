begin;

create extension if not exists pgcrypto;

create table if not exists public.weekly_timesheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (date_trunc('week', week_start::timestamp)::date = week_start),
  unique (user_id, week_start)
);

create table if not exists public.weekly_timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references public.weekly_timesheets(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  hours numeric(6,2) not null default 0 check (hours >= 0 and hours <= 168),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (timesheet_id, project_id)
);

create index if not exists idx_weekly_timesheets_user_week
  on public.weekly_timesheets(user_id, week_start desc);

create index if not exists idx_weekly_timesheet_entries_timesheet
  on public.weekly_timesheet_entries(timesheet_id);

create index if not exists idx_weekly_timesheet_entries_project
  on public.weekly_timesheet_entries(project_id);

create or replace function public.touch_weekly_timesheet_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_weekly_timesheets_updated_at on public.weekly_timesheets;
create trigger trg_weekly_timesheets_updated_at
before update on public.weekly_timesheets
for each row
execute function public.touch_weekly_timesheet_row();

drop trigger if exists trg_weekly_timesheet_entries_updated_at on public.weekly_timesheet_entries;
create trigger trg_weekly_timesheet_entries_updated_at
before update on public.weekly_timesheet_entries
for each row
execute function public.touch_weekly_timesheet_row();

create or replace function public.is_timesheet_owner(target_timesheet_id uuid, subject_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.weekly_timesheets wt
    where wt.id = target_timesheet_id
      and wt.user_id = subject_user
  )
$$;

create or replace function public.can_write_timesheet_entry(target_timesheet_id uuid, target_project_id uuid, subject_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_timesheet_owner(target_timesheet_id, subject_user)
    and public.can_access_project(target_project_id, subject_user)
$$;

alter table public.weekly_timesheets enable row level security;
alter table public.weekly_timesheet_entries enable row level security;

drop policy if exists "weekly_timesheets_select_own" on public.weekly_timesheets;
drop policy if exists "weekly_timesheets_insert_own" on public.weekly_timesheets;
drop policy if exists "weekly_timesheets_update_own" on public.weekly_timesheets;
drop policy if exists "weekly_timesheets_delete_own" on public.weekly_timesheets;

create policy "weekly_timesheets_select_own"
  on public.weekly_timesheets
  for select
  using (auth.uid() = user_id);

create policy "weekly_timesheets_insert_own"
  on public.weekly_timesheets
  for insert
  with check (auth.uid() = user_id);

create policy "weekly_timesheets_update_own"
  on public.weekly_timesheets
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "weekly_timesheets_delete_own"
  on public.weekly_timesheets
  for delete
  using (auth.uid() = user_id);

drop policy if exists "weekly_timesheet_entries_select_own" on public.weekly_timesheet_entries;
drop policy if exists "weekly_timesheet_entries_insert_own" on public.weekly_timesheet_entries;
drop policy if exists "weekly_timesheet_entries_update_own" on public.weekly_timesheet_entries;
drop policy if exists "weekly_timesheet_entries_delete_own" on public.weekly_timesheet_entries;

create policy "weekly_timesheet_entries_select_own"
  on public.weekly_timesheet_entries
  for select
  using (public.is_timesheet_owner(timesheet_id, auth.uid()));

create policy "weekly_timesheet_entries_insert_own"
  on public.weekly_timesheet_entries
  for insert
  with check (public.can_write_timesheet_entry(timesheet_id, project_id, auth.uid()));

create policy "weekly_timesheet_entries_update_own"
  on public.weekly_timesheet_entries
  for update
  using (public.is_timesheet_owner(timesheet_id, auth.uid()))
  with check (public.can_write_timesheet_entry(timesheet_id, project_id, auth.uid()));

create policy "weekly_timesheet_entries_delete_own"
  on public.weekly_timesheet_entries
  for delete
  using (public.is_timesheet_owner(timesheet_id, auth.uid()));

commit;
