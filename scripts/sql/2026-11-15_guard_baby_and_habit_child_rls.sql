begin;

-- 1. Parent row access helpers:
--    - Personal rows (row_household_project_id is null): accessible only to row_user_id.
--    - Household rows (row_household_project_id is not null): accessible only while
--      the caller has access to row_household_project_id (so a removed collaborator
--      loses access even if they originally created the shared baby/habit record).
create or replace function public.can_access_baby_row(row_user_id uuid, row_household_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when row_household_project_id is not null then public.can_access_household_project(row_household_project_id)
    else row_user_id = auth.uid()
  end;
$$;

create or replace function public.can_access_habit_row(row_user_id uuid, row_household_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when row_household_project_id is not null then public.can_access_project(row_household_project_id, auth.uid())
    else row_user_id = auth.uid()
  end;
$$;

-- 2. Parent immutability triggers on public.baby_profiles and public.habit_items:
--    - Prevent changing id, user_id, household_project_id, or created_at on UPDATE.
create or replace function public.guard_baby_profile_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.household_project_id is distinct from old.household_project_id then
      raise exception 'Baby profile ownership and household cannot change';
    end if;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_baby_profile_row() from public, anon, authenticated;

drop trigger if exists aa_guard_baby_profile_row on public.baby_profiles;
create trigger aa_guard_baby_profile_row
before update on public.baby_profiles
for each row execute function public.guard_baby_profile_row();

create or replace function public.guard_habit_item_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.household_project_id is distinct from old.household_project_id then
      raise exception 'Habit item ownership and household cannot change';
    end if;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_habit_item_row() from public, anon, authenticated;

drop trigger if exists aa_guard_habit_item_row on public.habit_items;
create trigger aa_guard_habit_item_row
before update on public.habit_items
for each row execute function public.guard_habit_item_row();

-- 3. Caller-scoped (SECURITY INVOKER) triggers for Baby and Habit child tables:
--    - No SECURITY DEFINER: parent lookups run under the caller's RLS policies,
--      never probing private parent rows or leaking archived state before RLS.
--    - Preserve id, baby_id/habit_id, user_id (original author), household_project_id,
--      and created_at on UPDATE so partner edits and sleep/habit upserts succeed.
create or replace function public.guard_baby_child_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.baby_id is distinct from old.baby_id then
      raise exception 'Baby entry identity cannot change';
    end if;
    new.user_id := old.user_id;
    new.household_project_id := old.household_project_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_baby_child_row() from public, anon, authenticated;

drop trigger if exists aa_guard_baby_child_row on public.baby_feed_entries;
create trigger aa_guard_baby_child_row
before update on public.baby_feed_entries
for each row execute function public.guard_baby_child_row();

drop trigger if exists aa_guard_baby_child_row on public.baby_nappy_entries;
create trigger aa_guard_baby_child_row
before update on public.baby_nappy_entries
for each row execute function public.guard_baby_child_row();

drop trigger if exists aa_guard_baby_child_row on public.baby_sleep_blocks;
create trigger aa_guard_baby_child_row
before update on public.baby_sleep_blocks
for each row execute function public.guard_baby_child_row();

drop trigger if exists aa_guard_baby_child_row on public.baby_weight_entries;
create trigger aa_guard_baby_child_row
before update on public.baby_weight_entries
for each row execute function public.guard_baby_child_row();

create or replace function public.guard_habit_entry_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.habit_id is distinct from old.habit_id then
      raise exception 'Habit entry identity cannot change';
    end if;
    new.user_id := old.user_id;
    new.household_project_id := old.household_project_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_habit_entry_row() from public, anon, authenticated;

drop trigger if exists aa_guard_habit_entry_row on public.habit_entries;
create trigger aa_guard_habit_entry_row
before update on public.habit_entries
for each row execute function public.guard_habit_entry_row();

create or replace function public.guard_habit_reminder_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'Habit reminder identity cannot change';
    end if;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    if new.habit_id is not null
      and new.habit_id is distinct from old.habit_id
      and exists (
        select 1
        from public.habit_items h
        where h.id = new.habit_id
          and h.archived_at is not null
      ) then
      raise exception 'new row violates row-level security policy for table "habit_reminders"'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_habit_reminder_row() from public, anon, authenticated;

drop trigger if exists aa_guard_habit_reminder_row on public.habit_reminders;
create trigger aa_guard_habit_reminder_row
before update on public.habit_reminders
for each row execute function public.guard_habit_reminder_row();

-- 4. Parent table policies: require user_id = auth.uid() on INSERT and scope to authenticated
drop policy if exists baby_profiles_access on public.baby_profiles;
drop policy if exists baby_profiles_select on public.baby_profiles;
drop policy if exists baby_profiles_insert on public.baby_profiles;
drop policy if exists baby_profiles_update on public.baby_profiles;
drop policy if exists baby_profiles_delete on public.baby_profiles;

create policy baby_profiles_select on public.baby_profiles
for select to authenticated
using (public.can_access_baby_row(public.baby_profiles.user_id, public.baby_profiles.household_project_id));

create policy baby_profiles_insert on public.baby_profiles
for insert to authenticated
with check (
  public.baby_profiles.user_id = auth.uid()
  and public.can_access_baby_row(public.baby_profiles.user_id, public.baby_profiles.household_project_id)
);

create policy baby_profiles_update on public.baby_profiles
for update to authenticated
using (public.can_access_baby_row(public.baby_profiles.user_id, public.baby_profiles.household_project_id))
with check (public.can_access_baby_row(public.baby_profiles.user_id, public.baby_profiles.household_project_id));

create policy baby_profiles_delete on public.baby_profiles
for delete to authenticated
using (public.can_access_baby_row(public.baby_profiles.user_id, public.baby_profiles.household_project_id));

drop policy if exists habit_items_access on public.habit_items;
drop policy if exists habit_items_select on public.habit_items;
drop policy if exists habit_items_insert on public.habit_items;
drop policy if exists habit_items_update on public.habit_items;
drop policy if exists habit_items_delete on public.habit_items;

create policy habit_items_select on public.habit_items
for select to authenticated
using (public.can_access_habit_row(public.habit_items.user_id, public.habit_items.household_project_id));

create policy habit_items_insert on public.habit_items
for insert to authenticated
with check (
  public.habit_items.user_id = auth.uid()
  and public.can_access_habit_row(public.habit_items.user_id, public.habit_items.household_project_id)
);

create policy habit_items_update on public.habit_items
for update to authenticated
using (public.can_access_habit_row(public.habit_items.user_id, public.habit_items.household_project_id))
with check (public.can_access_habit_row(public.habit_items.user_id, public.habit_items.household_project_id));

create policy habit_items_delete on public.habit_items
for delete to authenticated
using (public.can_access_habit_row(public.habit_items.user_id, public.habit_items.household_project_id));

-- 3. Baby child table RLS policies (scoped to authenticated, derived from parent public.baby_profiles)
drop policy if exists baby_feed_entries_access on public.baby_feed_entries;
drop policy if exists baby_feed_entries_select on public.baby_feed_entries;
drop policy if exists baby_feed_entries_insert on public.baby_feed_entries;
drop policy if exists baby_feed_entries_update on public.baby_feed_entries;
drop policy if exists baby_feed_entries_delete on public.baby_feed_entries;

create policy baby_feed_entries_select on public.baby_feed_entries
for select to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_feed_entries.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_feed_entries_insert on public.baby_feed_entries
for insert to authenticated
with check (
  public.baby_feed_entries.user_id = auth.uid()
  and exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_feed_entries.baby_id
      and b.archived_at is null
      and public.baby_feed_entries.household_project_id is not distinct from b.household_project_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_feed_entries_update on public.baby_feed_entries
for update to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_feed_entries.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
)
with check (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_feed_entries.baby_id
      and b.archived_at is null
      and public.baby_feed_entries.household_project_id is not distinct from b.household_project_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_feed_entries_delete on public.baby_feed_entries
for delete to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_feed_entries.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

-- Nappy entries
drop policy if exists baby_nappy_entries_access on public.baby_nappy_entries;
drop policy if exists baby_nappy_entries_select on public.baby_nappy_entries;
drop policy if exists baby_nappy_entries_insert on public.baby_nappy_entries;
drop policy if exists baby_nappy_entries_update on public.baby_nappy_entries;
drop policy if exists baby_nappy_entries_delete on public.baby_nappy_entries;

create policy baby_nappy_entries_select on public.baby_nappy_entries
for select to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_nappy_entries.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_nappy_entries_insert on public.baby_nappy_entries
for insert to authenticated
with check (
  public.baby_nappy_entries.user_id = auth.uid()
  and exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_nappy_entries.baby_id
      and b.archived_at is null
      and public.baby_nappy_entries.household_project_id is not distinct from b.household_project_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_nappy_entries_update on public.baby_nappy_entries
for update to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_nappy_entries.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
)
with check (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_nappy_entries.baby_id
      and b.archived_at is null
      and public.baby_nappy_entries.household_project_id is not distinct from b.household_project_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_nappy_entries_delete on public.baby_nappy_entries
for delete to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_nappy_entries.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

-- Sleep blocks
drop policy if exists baby_sleep_blocks_access on public.baby_sleep_blocks;
drop policy if exists baby_sleep_blocks_select on public.baby_sleep_blocks;
drop policy if exists baby_sleep_blocks_insert on public.baby_sleep_blocks;
drop policy if exists baby_sleep_blocks_update on public.baby_sleep_blocks;
drop policy if exists baby_sleep_blocks_delete on public.baby_sleep_blocks;

create policy baby_sleep_blocks_select on public.baby_sleep_blocks
for select to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_sleep_blocks.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_sleep_blocks_insert on public.baby_sleep_blocks
for insert to authenticated
with check (
  public.baby_sleep_blocks.user_id = auth.uid()
  and exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_sleep_blocks.baby_id
      and b.archived_at is null
      and public.baby_sleep_blocks.household_project_id is not distinct from b.household_project_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_sleep_blocks_update on public.baby_sleep_blocks
for update to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_sleep_blocks.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
)
with check (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_sleep_blocks.baby_id
      and b.archived_at is null
      and public.baby_sleep_blocks.household_project_id is not distinct from b.household_project_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_sleep_blocks_delete on public.baby_sleep_blocks
for delete to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_sleep_blocks.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

-- Baby weight entries
drop policy if exists baby_weight_entries_access on public.baby_weight_entries;
drop policy if exists baby_weight_entries_select on public.baby_weight_entries;
drop policy if exists baby_weight_entries_insert on public.baby_weight_entries;
drop policy if exists baby_weight_entries_update on public.baby_weight_entries;
drop policy if exists baby_weight_entries_delete on public.baby_weight_entries;

create policy baby_weight_entries_select on public.baby_weight_entries
for select to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_weight_entries.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_weight_entries_insert on public.baby_weight_entries
for insert to authenticated
with check (
  public.baby_weight_entries.user_id = auth.uid()
  and exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_weight_entries.baby_id
      and b.archived_at is null
      and public.baby_weight_entries.household_project_id is not distinct from b.household_project_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_weight_entries_update on public.baby_weight_entries
for update to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_weight_entries.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
)
with check (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_weight_entries.baby_id
      and b.archived_at is null
      and public.baby_weight_entries.household_project_id is not distinct from b.household_project_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

create policy baby_weight_entries_delete on public.baby_weight_entries
for delete to authenticated
using (
  exists (
    select 1
    from public.baby_profiles b
    where b.id = public.baby_weight_entries.baby_id
      and public.can_access_baby_row(b.user_id, b.household_project_id)
  )
);

-- 4. Habit child table RLS policies (scoped to authenticated, derived from parent public.habit_items)
drop policy if exists habit_entries_access on public.habit_entries;
drop policy if exists habit_entries_select on public.habit_entries;
drop policy if exists habit_entries_insert on public.habit_entries;
drop policy if exists habit_entries_update on public.habit_entries;
drop policy if exists habit_entries_delete on public.habit_entries;

create policy habit_entries_select on public.habit_entries
for select to authenticated
using (
  exists (
    select 1
    from public.habit_items h
    where h.id = public.habit_entries.habit_id
      and public.can_access_habit_row(h.user_id, h.household_project_id)
  )
);

create policy habit_entries_insert on public.habit_entries
for insert to authenticated
with check (
  public.habit_entries.user_id = auth.uid()
  and exists (
    select 1
    from public.habit_items h
    where h.id = public.habit_entries.habit_id
      and h.archived_at is null
      and public.habit_entries.household_project_id is not distinct from h.household_project_id
      and public.can_access_habit_row(h.user_id, h.household_project_id)
  )
);

create policy habit_entries_update on public.habit_entries
for update to authenticated
using (
  exists (
    select 1
    from public.habit_items h
    where h.id = public.habit_entries.habit_id
      and public.can_access_habit_row(h.user_id, h.household_project_id)
  )
)
with check (
  exists (
    select 1
    from public.habit_items h
    where h.id = public.habit_entries.habit_id
      and h.archived_at is null
      and public.habit_entries.household_project_id is not distinct from h.household_project_id
      and public.can_access_habit_row(h.user_id, h.household_project_id)
  )
);

create policy habit_entries_delete on public.habit_entries
for delete to authenticated
using (
  exists (
    select 1
    from public.habit_items h
    where h.id = public.habit_entries.habit_id
      and public.can_access_habit_row(h.user_id, h.household_project_id)
  )
);

-- Habit reminders (habit_id is nullable for general journal reminders)
drop policy if exists habit_reminders_access on public.habit_reminders;
drop policy if exists habit_reminders_select on public.habit_reminders;
drop policy if exists habit_reminders_insert on public.habit_reminders;
drop policy if exists habit_reminders_update on public.habit_reminders;
drop policy if exists habit_reminders_delete on public.habit_reminders;

create policy habit_reminders_select on public.habit_reminders
for select to authenticated
using (
  public.can_access_habit_row(public.habit_reminders.user_id, public.habit_reminders.household_project_id)
  and (
    public.habit_reminders.habit_id is null
    or exists (
      select 1
      from public.habit_items h
      where h.id = public.habit_reminders.habit_id
        and public.can_access_habit_row(h.user_id, h.household_project_id)
    )
  )
);

create policy habit_reminders_insert on public.habit_reminders
for insert to authenticated
with check (
  public.habit_reminders.user_id = auth.uid()
  and public.can_access_habit_row(public.habit_reminders.user_id, public.habit_reminders.household_project_id)
  and (
    public.habit_reminders.habit_id is null
    or exists (
      select 1
      from public.habit_items h
      where h.id = public.habit_reminders.habit_id
        and h.archived_at is null
        and public.habit_reminders.household_project_id is not distinct from h.household_project_id
        and public.can_access_habit_row(h.user_id, h.household_project_id)
    )
  )
);

create policy habit_reminders_update on public.habit_reminders
for update to authenticated
using (
  public.can_access_habit_row(public.habit_reminders.user_id, public.habit_reminders.household_project_id)
  and (
    public.habit_reminders.habit_id is null
    or exists (
      select 1
      from public.habit_items h
      where h.id = public.habit_reminders.habit_id
        and public.can_access_habit_row(h.user_id, h.household_project_id)
    )
  )
)
with check (
  public.can_access_habit_row(public.habit_reminders.user_id, public.habit_reminders.household_project_id)
  and (
    public.habit_reminders.habit_id is null
    or exists (
      select 1
      from public.habit_items h
      where h.id = public.habit_reminders.habit_id
        and public.habit_reminders.household_project_id is not distinct from h.household_project_id
        and public.can_access_habit_row(h.user_id, h.household_project_id)
    )
  )
);

create policy habit_reminders_delete on public.habit_reminders
for delete to authenticated
using (
  public.can_access_habit_row(public.habit_reminders.user_id, public.habit_reminders.household_project_id)
  and (
    public.habit_reminders.habit_id is null
    or exists (
      select 1
      from public.habit_items h
      where h.id = public.habit_reminders.habit_id
        and public.can_access_habit_row(h.user_id, h.household_project_id)
    )
  )
);

-- 5. Post-condition verification block
do $$
declare
  tbl text;
  secured_tables constant text[] := array[
    'baby_profiles',
    'baby_feed_entries',
    'baby_nappy_entries',
    'baby_sleep_blocks',
    'baby_weight_entries',
    'habit_items',
    'habit_entries',
    'habit_reminders'
  ];
begin
  foreach tbl in array secured_tables loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = tbl
        and c.relrowsecurity
    ) then
      raise exception 'RLS_NOT_ENABLED on %', tbl;
    end if;

    if exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and policyname = tbl || '_access'
    ) then
      raise exception 'LEGACY_POLICY_STILL_PRESENT on %', tbl;
    end if;

    if (
      select count(*)
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
    ) <> 4
    or (
      select count(distinct cmd)
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ) <> 4 then
      raise exception 'EXPECTED_EXACTLY_FOUR_CMD_POLICIES on %', tbl;
    end if;
  end loop;

  if exists (
    select 1
    from pg_proc
    where oid in (
      to_regprocedure('public.guard_baby_profile_row()'),
      to_regprocedure('public.guard_habit_item_row()'),
      to_regprocedure('public.guard_baby_child_row()'),
      to_regprocedure('public.guard_habit_entry_row()'),
      to_regprocedure('public.guard_habit_reminder_row()')
    )
      and prosecdef
  ) then
    raise exception 'GUARD_TRIGGER_MUST_NOT_BE_SECURITY_DEFINER';
  end if;
end
$$;

commit;
