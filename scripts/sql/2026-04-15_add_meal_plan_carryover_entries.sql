alter table public.meal_plan_entries
  add column if not exists entry_kind text;

update public.meal_plan_entries
set entry_kind = 'planned'
where entry_kind is null;

alter table public.meal_plan_entries
  alter column entry_kind set default 'planned';

alter table public.meal_plan_entries
  alter column entry_kind set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meal_plan_entries_entry_kind_check'
  ) then
    alter table public.meal_plan_entries
      add constraint meal_plan_entries_entry_kind_check
      check (entry_kind in ('planned', 'carryover'));
  end if;
end
$$;

alter table public.meal_plan_entries
  add column if not exists carryover_source_entry_id uuid
  references public.meal_plan_entries(id)
  on delete cascade;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meal_plan_entries_carryover_source_check'
  ) then
    alter table public.meal_plan_entries
      add constraint meal_plan_entries_carryover_source_check
      check (
        (entry_kind = 'planned' and carryover_source_entry_id is null)
        or
        (entry_kind = 'carryover' and carryover_source_entry_id is not null)
      );
  end if;
end
$$;

create index if not exists idx_meal_plan_entries_carryover_source
  on public.meal_plan_entries(carryover_source_entry_id);

create unique index if not exists idx_meal_plan_entries_unique_carryover_source
  on public.meal_plan_entries(carryover_source_entry_id)
  where carryover_source_entry_id is not null
    and entry_kind = 'carryover';
