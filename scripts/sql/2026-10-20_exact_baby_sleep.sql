begin;

create table if not exists public.baby_sleep_entries (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.baby_profiles(id) on delete cascade,
  sleep_date date not null,
  start_minute integer not null,
  end_minute integer not null,
  notes text not null default '',
  version integer not null default 1,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint baby_sleep_entry_interval_check check (
    start_minute >= 0 and start_minute < 1440 and end_minute > start_minute
    and end_minute <= start_minute + 1440 and char_length(notes) <= 2000
  ),
  constraint baby_sleep_entry_version_check check (version > 0)
);
create index if not exists idx_baby_sleep_entries_date on public.baby_sleep_entries(baby_id, sleep_date);
alter table public.baby_sleep_entries enable row level security;

-- Access follows the actual parent profile, with no caller-supplied household link.
drop policy if exists baby_sleep_entries_access on public.baby_sleep_entries;
create policy baby_sleep_entries_access on public.baby_sleep_entries
for all to authenticated
using (exists (select 1 from public.baby_profiles b where b.id = baby_id
  and public.can_access_baby_row(b.user_id, b.household_project_id)))
with check (exists (select 1 from public.baby_profiles b where b.id = baby_id
  and b.archived_at is null and public.can_access_baby_row(b.user_id, b.household_project_id)));

create or replace function public.bump_baby_sleep_entry_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.baby_id is distinct from old.baby_id then
    raise exception 'Sleep entry identity cannot change';
  end if;
  new.version := old.version + 1;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_baby_sleep_entry_version on public.baby_sleep_entries;
create trigger trg_baby_sleep_entry_version before update on public.baby_sleep_entries
for each row execute function public.bump_baby_sleep_entry_version();
revoke all on public.baby_sleep_entries from public, anon, authenticated;
grant select, insert, update on public.baby_sleep_entries to authenticated;
grant all on public.baby_sleep_entries to service_role;
revoke all on function public.bump_baby_sleep_entry_version() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
