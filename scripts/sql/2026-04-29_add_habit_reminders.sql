begin;

create extension if not exists pgcrypto;

create table if not exists public.habit_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid null references public.habit_items(id) on delete set null,
  household_project_id uuid null references public.projects(id) on delete cascade,
  title text not null default 'It is time to update your journal.',
  reminder_time time not null default '21:00',
  frequency text not null default 'daily' check (frequency in ('daily', 'weekdays', 'custom')),
  weekdays integer[] not null default array[0, 1, 2, 3, 4, 5, 6],
  is_enabled boolean not null default true,
  timezone text not null default 'Europe/London',
  last_triggered_date date null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint habit_reminders_weekdays_valid check (
    array_length(weekdays, 1) is null
    or weekdays <@ array[0, 1, 2, 3, 4, 5, 6]
  )
);

create index if not exists idx_habit_reminders_user_enabled
  on public.habit_reminders(user_id, is_enabled, reminder_time);

create index if not exists idx_habit_reminders_habit
  on public.habit_reminders(habit_id);

create index if not exists idx_habit_reminders_household
  on public.habit_reminders(household_project_id, is_enabled, reminder_time);

drop trigger if exists trg_habit_reminders_updated_at on public.habit_reminders;
create trigger trg_habit_reminders_updated_at
before update on public.habit_reminders
for each row execute function public.bump_habit_tracker_updated_at();

alter table public.habit_reminders enable row level security;

drop policy if exists habit_reminders_access on public.habit_reminders;
create policy habit_reminders_access on public.habit_reminders
for all
using (public.can_access_habit_row(user_id, household_project_id))
with check (public.can_access_habit_row(user_id, household_project_id));

commit;
