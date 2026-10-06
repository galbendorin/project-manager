-- Add personal work-day selection. Genuine task deadlines are unchanged.
-- Run once in the existing project-manager Supabase project before publication.
begin;
alter table public.task_eisenhower_preferences
  add column if not exists planned_day date;
comment on column public.task_eisenhower_preferences.planned_day is
  'Personal day to work on this task; does not change its source deadline.';
notify pgrst, 'reload schema';
commit;
