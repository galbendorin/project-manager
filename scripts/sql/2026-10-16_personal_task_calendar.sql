-- Additive Calendar storage. Run once before publishing the Calendar client.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.task_eisenhower_preferences
  add column if not exists planned_start_minute integer,
  add column if not exists planned_duration_minutes integer;

-- Older clients may clear only planned_day. Keep their operation valid while
-- clearing the dependent reservation, without changing identity/version logic.
create or replace function public.normalize_task_calendar_slot() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.planned_day is null then
    new.planned_start_minute := null;
    new.planned_duration_minutes := null;
  end if;
  return new;
end $$;
revoke all on function public.normalize_task_calendar_slot() from public, anon, authenticated;
drop trigger if exists trg_task_calendar_normalize on public.task_eisenhower_preferences;
create trigger trg_task_calendar_normalize before insert or update on public.task_eisenhower_preferences
for each row execute function public.normalize_task_calendar_slot();
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.task_eisenhower_preferences'::regclass and conname = 'task_calendar_slot_check') then
    alter table public.task_eisenhower_preferences add constraint task_calendar_slot_check check (
      (planned_start_minute is null and planned_duration_minutes is null)
      or (planned_day is not null and planned_start_minute is not null and planned_duration_minutes is not null
        and planned_start_minute >= 360 and planned_start_minute <= 1350
        and planned_start_minute % 30 = 0 and planned_duration_minutes >= 30
        and planned_duration_minutes % 30 = 0 and planned_duration_minutes <= 1020
        and planned_start_minute + planned_duration_minutes <= 1380)
    );
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
