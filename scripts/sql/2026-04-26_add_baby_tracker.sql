begin;

create extension if not exists pgcrypto;

create table if not exists public.baby_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_project_id uuid null references public.projects(id) on delete cascade,
  name text not null default 'Baby',
  birth_date date null,
  archived_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.baby_feed_entries (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.baby_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_project_id uuid null references public.projects(id) on delete cascade,
  occurred_at timestamptz not null default timezone('utc', now()),
  local_date date not null,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  feed_type text null check (feed_type is null or feed_type in ('breastfeeding', 'expressed_milk', 'formula', 'other')),
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.baby_nappy_entries (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.baby_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_project_id uuid null references public.projects(id) on delete cascade,
  occurred_at timestamptz not null default timezone('utc', now()),
  local_date date not null,
  nappy_type text not null check (nappy_type in ('wet', 'poo', 'mixed')),
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.baby_sleep_blocks (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.baby_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_project_id uuid null references public.projects(id) on delete cascade,
  sleep_date date not null,
  block_index integer not null check (block_index >= 0 and block_index <= 95),
  status text not null default 'asleep' check (status in ('asleep', 'awake')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint baby_sleep_blocks_one_per_block unique (baby_id, sleep_date, block_index)
);

create table if not exists public.baby_weight_entries (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.baby_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_project_id uuid null references public.projects(id) on delete cascade,
  measured_at date not null,
  weight_value numeric not null check (weight_value > 0),
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_baby_profiles_user on public.baby_profiles(user_id);
create index if not exists idx_baby_profiles_household on public.baby_profiles(household_project_id);
create index if not exists idx_baby_feed_baby_date on public.baby_feed_entries(baby_id, local_date, occurred_at);
create index if not exists idx_baby_feed_household on public.baby_feed_entries(household_project_id);
create index if not exists idx_baby_nappy_baby_date on public.baby_nappy_entries(baby_id, local_date, occurred_at);
create index if not exists idx_baby_nappy_household on public.baby_nappy_entries(household_project_id);
create index if not exists idx_baby_sleep_baby_date on public.baby_sleep_blocks(baby_id, sleep_date, block_index);
create index if not exists idx_baby_sleep_household on public.baby_sleep_blocks(household_project_id);
create index if not exists idx_baby_weight_baby_date on public.baby_weight_entries(baby_id, measured_at desc);
create index if not exists idx_baby_weight_household on public.baby_weight_entries(household_project_id);

create or replace function public.bump_baby_tracker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_baby_profiles_updated_at on public.baby_profiles;
create trigger trg_baby_profiles_updated_at
before update on public.baby_profiles
for each row execute function public.bump_baby_tracker_updated_at();

drop trigger if exists trg_baby_feed_entries_updated_at on public.baby_feed_entries;
create trigger trg_baby_feed_entries_updated_at
before update on public.baby_feed_entries
for each row execute function public.bump_baby_tracker_updated_at();

drop trigger if exists trg_baby_nappy_entries_updated_at on public.baby_nappy_entries;
create trigger trg_baby_nappy_entries_updated_at
before update on public.baby_nappy_entries
for each row execute function public.bump_baby_tracker_updated_at();

drop trigger if exists trg_baby_sleep_blocks_updated_at on public.baby_sleep_blocks;
create trigger trg_baby_sleep_blocks_updated_at
before update on public.baby_sleep_blocks
for each row execute function public.bump_baby_tracker_updated_at();

drop trigger if exists trg_baby_weight_entries_updated_at on public.baby_weight_entries;
create trigger trg_baby_weight_entries_updated_at
before update on public.baby_weight_entries
for each row execute function public.bump_baby_tracker_updated_at();

alter table public.baby_profiles enable row level security;
alter table public.baby_feed_entries enable row level security;
alter table public.baby_nappy_entries enable row level security;
alter table public.baby_sleep_blocks enable row level security;
alter table public.baby_weight_entries enable row level security;

create or replace function public.can_access_household_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_project_id is not null
    and public.can_access_project(target_project_id, auth.uid());
$$;

create or replace function public.can_access_baby_row(row_user_id uuid, row_household_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select row_user_id = auth.uid()
    or public.can_access_household_project(row_household_project_id);
$$;

drop policy if exists baby_profiles_access on public.baby_profiles;
create policy baby_profiles_access on public.baby_profiles
for all
using (public.can_access_baby_row(user_id, household_project_id))
with check (public.can_access_baby_row(user_id, household_project_id));

drop policy if exists baby_feed_entries_access on public.baby_feed_entries;
create policy baby_feed_entries_access on public.baby_feed_entries
for all
using (public.can_access_baby_row(user_id, household_project_id))
with check (public.can_access_baby_row(user_id, household_project_id));

drop policy if exists baby_nappy_entries_access on public.baby_nappy_entries;
create policy baby_nappy_entries_access on public.baby_nappy_entries
for all
using (public.can_access_baby_row(user_id, household_project_id))
with check (public.can_access_baby_row(user_id, household_project_id));

drop policy if exists baby_sleep_blocks_access on public.baby_sleep_blocks;
create policy baby_sleep_blocks_access on public.baby_sleep_blocks
for all
using (public.can_access_baby_row(user_id, household_project_id))
with check (public.can_access_baby_row(user_id, household_project_id));

drop policy if exists baby_weight_entries_access on public.baby_weight_entries;
create policy baby_weight_entries_access on public.baby_weight_entries
for all
using (public.can_access_baby_row(user_id, household_project_id))
with check (public.can_access_baby_row(user_id, household_project_id));

commit;
