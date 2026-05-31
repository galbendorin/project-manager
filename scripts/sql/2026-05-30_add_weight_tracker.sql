begin;

create extension if not exists pgcrypto;

create table if not exists public.weight_tracker_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_unit text not null default 'kg' check (preferred_unit in ('kg', 'lb')),
  goal_weight_kg numeric null check (goal_weight_kg is null or (goal_weight_kg > 0 and goal_weight_kg < 500)),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_value numeric not null check (weight_value > 0 and weight_value < 1000),
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  weight_kg numeric not null check (weight_kg > 0 and weight_kg < 500),
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint weight_entries_one_per_day unique (user_id, measured_on)
);

create index if not exists idx_weight_entries_user_date
  on public.weight_entries(user_id, measured_on desc);

create or replace function public.bump_weight_tracker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_weight_tracker_settings_updated_at on public.weight_tracker_settings;
create trigger trg_weight_tracker_settings_updated_at
before update on public.weight_tracker_settings
for each row execute function public.bump_weight_tracker_updated_at();

drop trigger if exists trg_weight_entries_updated_at on public.weight_entries;
create trigger trg_weight_entries_updated_at
before update on public.weight_entries
for each row execute function public.bump_weight_tracker_updated_at();

alter table public.weight_tracker_settings enable row level security;
alter table public.weight_entries enable row level security;

drop policy if exists weight_tracker_settings_access on public.weight_tracker_settings;
create policy weight_tracker_settings_access on public.weight_tracker_settings
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists weight_entries_access on public.weight_entries;
create policy weight_entries_access on public.weight_entries
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

commit;
