alter table public.meal_plan_weeks
  add column if not exists adult_portion_total double precision;

update public.meal_plan_weeks
set adult_portion_total = case
  when adult_count is null then 1.75
  when adult_count > 1 then adult_count::double precision
  else 1.75
end
where adult_portion_total is null;

alter table public.meal_plan_weeks
  alter column adult_portion_total set default 1.75;

alter table public.meal_plan_weeks
  alter column adult_portion_total set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meal_plan_weeks_adult_portion_total_positive_check'
  ) then
    alter table public.meal_plan_weeks
      add constraint meal_plan_weeks_adult_portion_total_positive_check
      check (adult_portion_total > 0);
  end if;
end
$$;
