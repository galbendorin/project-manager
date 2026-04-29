begin;

create extension if not exists pgcrypto;

create table if not exists public.habit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_project_id uuid null references public.projects(id) on delete cascade,
  name text not null,
  direction text not null default 'positive' check (direction in ('positive', 'negative')),
  color text not null default '#f59e0b',
  sort_order integer not null default 0,
  archived_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.habit_entries (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habit_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_project_id uuid null references public.projects(id) on delete cascade,
  entry_date date not null,
  status text not null check (status in ('yes', 'no', 'skip')),
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint habit_entries_one_per_day unique (habit_id, entry_date)
);

create index if not exists idx_habit_items_user_active
  on public.habit_items(user_id, archived_at, sort_order);

create index if not exists idx_habit_items_household
  on public.habit_items(household_project_id, archived_at, sort_order);

create index if not exists idx_habit_entries_habit_date
  on public.habit_entries(habit_id, entry_date);

create index if not exists idx_habit_entries_user_date
  on public.habit_entries(user_id, entry_date);

create index if not exists idx_habit_entries_household_date
  on public.habit_entries(household_project_id, entry_date);

create or replace function public.bump_habit_tracker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_habit_items_updated_at on public.habit_items;
create trigger trg_habit_items_updated_at
before update on public.habit_items
for each row execute function public.bump_habit_tracker_updated_at();

drop trigger if exists trg_habit_entries_updated_at on public.habit_entries;
create trigger trg_habit_entries_updated_at
before update on public.habit_entries
for each row execute function public.bump_habit_tracker_updated_at();

alter table public.habit_items enable row level security;
alter table public.habit_entries enable row level security;

create or replace function public.can_access_habit_row(row_user_id uuid, row_household_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select row_user_id = auth.uid()
    or (
      row_household_project_id is not null
      and public.can_access_project(row_household_project_id, auth.uid())
    );
$$;

drop policy if exists habit_items_access on public.habit_items;
create policy habit_items_access on public.habit_items
for all
using (public.can_access_habit_row(user_id, household_project_id))
with check (public.can_access_habit_row(user_id, household_project_id));

drop policy if exists habit_entries_access on public.habit_entries;
create policy habit_entries_access on public.habit_entries
for all
using (public.can_access_habit_row(user_id, household_project_id))
with check (public.can_access_habit_row(user_id, household_project_id));

commit;
