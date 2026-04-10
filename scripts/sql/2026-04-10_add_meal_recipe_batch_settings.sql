alter table public.meal_library_meals
  add column if not exists yield_mode text;

update public.meal_library_meals
set yield_mode = 'flexible'
where yield_mode is null;

alter table public.meal_library_meals
  alter column yield_mode set default 'flexible';

alter table public.meal_library_meals
  alter column yield_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meal_library_meals_yield_mode_check'
  ) then
    alter table public.meal_library_meals
      add constraint meal_library_meals_yield_mode_check
      check (yield_mode in ('flexible', 'batch'));
  end if;
end
$$;

alter table public.meal_library_meals
  add column if not exists batch_yield_portions double precision;

update public.meal_library_meals
set batch_yield_portions = null
where batch_yield_portions is not null
  and batch_yield_portions <= 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meal_library_meals_batch_yield_positive_check'
  ) then
    alter table public.meal_library_meals
      add constraint meal_library_meals_batch_yield_positive_check
      check (batch_yield_portions is null or batch_yield_portions > 0);
  end if;
end
$$;
