-- Records the local calendar day of an explicit personal quadrant choice.
-- Existing choices remain unchanged; no RLS, grants, task rows or dates change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.task_eisenhower_preferences
  add column if not exists manual_quadrant_day date;
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_eisenhower_preferences'
      and column_name = 'manual_quadrant_day' and data_type = 'date'
  ) then
    raise exception 'manual_quadrant_day must be a date column';
  end if;
end $$;
comment on column public.task_eisenhower_preferences.manual_quadrant_day is
  'Local calendar day of the user''s explicit quadrant choice. Due-today overrides apply only on that day; overdue tasks always return to Q1.';
notify pgrst, 'reload schema';
commit;
