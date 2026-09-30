-- Q08: preserve current RLS, personal plans and household recipe sharing.
-- Run only after the Q08 verification and rollout checklist. Transactional:
-- mismatched existing relationships or lock/statement timeout abort everything.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.manual_todos, public.meal_library_meals,
  public.meal_plan_entries, public.meal_plan_grocery_batches,
  public.meal_plan_weeks in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.meal_plan_entries e
    join public.meal_plan_weeks w on w.id=e.week_id
    where w.shopping_project_id is null
  ) then
    raise exception 'Q08_LEGACY_UNLINKED_ENTRIES: no changes applied; review legacy plans before proceeding';
  end if;
  if exists (
    select 1 from public.meal_plan_grocery_batches b
    join public.meal_plan_weeks w on w.id=b.week_id
    where b.shopping_project_id is distinct from w.shopping_project_id
  ) or exists (
    select 1 from public.meal_plan_entries e
    join public.meal_plan_weeks w on w.id=e.week_id
    join public.meal_library_meals m on m.id=e.meal_id
    where w.shopping_project_id is distinct from m.shopping_project_id
  ) or exists (
    select 1 from public.meal_plan_entries e
    join public.meal_plan_weeks w on w.id=e.week_id
    join public.meal_plan_entries source on source.id=e.carryover_source_entry_id
    join public.meal_plan_weeks source_week on source_week.id=source.week_id
    where w.shopping_project_id is distinct from source_week.shopping_project_id
  ) or exists (
    select 1 from public.manual_todos t
    join public.meal_plan_grocery_batches b on b.id=t.source_batch_id
    where t.project_id is distinct from b.shopping_project_id
  ) then
    raise exception 'Q08_RELATIONSHIP_MISMATCH: no changes applied; inspect counts before proceeding';
  end if;
end
$$;

-- Cache the entry's existing week household solely for relational integrity.
-- Clients need not send this field; the invoker trigger derives it from a
-- visible week. RLS still independently enforces who can write the entry.
alter table public.meal_plan_entries add column if not exists shopping_project_id uuid;

do $$
declare
  previous_trigger_state "char";
begin
  select tgenabled into previous_trigger_state from pg_trigger
  where tgrelid='public.meal_plan_entries'::regclass
    and tgname='trg_meal_plan_entries_updated_at' and not tgisinternal;
  if previous_trigger_state is null then
    raise exception 'Q08_UPDATED_AT_TRIGGER_MISSING: no changes applied';
  end if;
  -- Preserve original modification timestamps during the derived-field fill.
  -- Never disable RLS, foreign keys or any other trigger. Restore the exact
  -- previous state before commit; an error rolls this transaction back.
  alter table public.meal_plan_entries disable trigger trg_meal_plan_entries_updated_at;
  update public.meal_plan_entries e set shopping_project_id=w.shopping_project_id
  from public.meal_plan_weeks w where w.id=e.week_id
    and e.shopping_project_id is distinct from w.shopping_project_id;
  case previous_trigger_state
    when 'O' then alter table public.meal_plan_entries enable trigger trg_meal_plan_entries_updated_at;
    when 'A' then alter table public.meal_plan_entries enable always trigger trg_meal_plan_entries_updated_at;
    when 'R' then alter table public.meal_plan_entries enable replica trigger trg_meal_plan_entries_updated_at;
    when 'D' then null;
    else raise exception 'Q08_UNEXPECTED_TRIGGER_STATE';
  end case;
end
$$;

alter table public.meal_plan_entries alter column shopping_project_id set not null;

create or replace function public.derive_meal_entry_household()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  select w.shopping_project_id into new.shopping_project_id
  from public.meal_plan_weeks w where w.id=new.week_id;
  if not found then
    raise exception using errcode='23503', message='MEAL_PLAN_WEEK_UNAVAILABLE';
  end if;
  return new;
end;
$$;
revoke all on function public.derive_meal_entry_household() from public, anon, authenticated;

drop trigger if exists trg_meal_plan_entries_derive_household on public.meal_plan_entries;
create trigger trg_meal_plan_entries_derive_household
before insert or update of week_id, shopping_project_id on public.meal_plan_entries
for each row execute function public.derive_meal_entry_household();

-- Composite foreign keys enforce the SAME household, including privileged
-- RPC writes and parent changes. PostgreSQL's FK locks cover concurrent writes;
-- this does not rely on an RLS snapshot or a client-side existence check.
create unique index if not exists q08_weeks_id_household_key
  on public.meal_plan_weeks(id,shopping_project_id);
create unique index if not exists q08_meals_id_household_key
  on public.meal_library_meals(id,shopping_project_id);
create unique index if not exists q08_entries_id_household_key
  on public.meal_plan_entries(id,shopping_project_id);
create unique index if not exists q08_batches_id_household_key
  on public.meal_plan_grocery_batches(id,shopping_project_id);

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.meal_plan_grocery_batches'::regclass
    and conname='q08_batch_week_household_fk') then
    alter table public.meal_plan_grocery_batches add constraint q08_batch_week_household_fk
      foreign key(week_id,shopping_project_id) references public.meal_plan_weeks(id,shopping_project_id);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.meal_plan_entries'::regclass
    and conname='q08_entry_week_household_fk') then
    alter table public.meal_plan_entries add constraint q08_entry_week_household_fk
      foreign key(week_id,shopping_project_id) references public.meal_plan_weeks(id,shopping_project_id);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.meal_plan_entries'::regclass
    and conname='q08_entry_recipe_household_fk') then
    alter table public.meal_plan_entries add constraint q08_entry_recipe_household_fk
      foreign key(meal_id,shopping_project_id) references public.meal_library_meals(id,shopping_project_id);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.meal_plan_entries'::regclass
    and conname='q08_carryover_source_household_fk') then
    alter table public.meal_plan_entries add constraint q08_carryover_source_household_fk
      foreign key(carryover_source_entry_id,shopping_project_id) references public.meal_plan_entries(id,shopping_project_id);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.manual_todos'::regclass
    and conname='q08_todo_batch_household_fk') then
    alter table public.manual_todos add constraint q08_todo_batch_household_fk
      foreign key(source_batch_id,project_id) references public.meal_plan_grocery_batches(id,shopping_project_id);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.manual_todos'::regclass
    and conname='q08_todo_batch_requires_project') then
    alter table public.manual_todos add constraint q08_todo_batch_requires_project
      check(source_batch_id is null or project_id is not null);
  end if;
end
$$;

-- Keep the raw owner lookup internal. RLS's SECURITY DEFINER helpers and
-- protected server functions still call it as their owner. No browser source
-- calls this raw UUID lookup directly. Explicit role grants must be revoked
-- as well as PUBLIC; CREATE OR REPLACE retains those historical grants.
revoke execute on function public.project_owner_id(uuid) from public, anon, authenticated;
grant execute on function public.project_owner_id(uuid) to service_role;

-- Match the existing server-only invitation design; browser sharing uses the
-- authenticated API, which supplies the server's service-role client.
revoke execute on function public.invite_project_member(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.invite_project_member(uuid,text,uuid) to service_role;

do $$
begin
  if has_function_privilege('anon','public.project_owner_id(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.project_owner_id(uuid)','EXECUTE')
    or has_function_privilege('anon','public.invite_project_member(uuid,text,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.invite_project_member(uuid,text,uuid)','EXECUTE') then
    raise exception 'Q08_UNEXPECTED_INHERITED_GRANT: no changes applied';
  end if;
end
$$;

commit;
