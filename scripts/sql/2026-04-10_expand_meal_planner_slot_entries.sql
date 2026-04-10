alter table public.meal_plan_entries
  add column if not exists audience text;

update public.meal_plan_entries
set audience = 'all'
where audience is null;

alter table public.meal_plan_entries
  alter column audience set default 'all';

alter table public.meal_plan_entries
  alter column audience set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meal_plan_entries_audience_check'
  ) then
    alter table public.meal_plan_entries
      add constraint meal_plan_entries_audience_check
      check (audience in ('all', 'adults', 'kids'));
  end if;
end
$$;

alter table public.meal_plan_entries
  add column if not exists entry_position integer;

update public.meal_plan_entries
set entry_position = 0
where entry_position is null;

alter table public.meal_plan_entries
  alter column entry_position set default 0;

alter table public.meal_plan_entries
  alter column entry_position set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'meal_plan_entries_week_id_date_meal_slot_key'
  ) then
    alter table public.meal_plan_entries
      drop constraint meal_plan_entries_week_id_date_meal_slot_key;
  end if;
end
$$;

create index if not exists idx_meal_plan_entries_week_slot_position
  on public.meal_plan_entries(week_id, date, meal_slot, entry_position, created_at);
