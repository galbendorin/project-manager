begin;

create table if not exists public.finance_household_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid null references auth.users(id) on delete cascade,
  member_email text not null,
  role text not null default 'editor' check (role in ('editor')),
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_user_id, member_email),
  check (member_email = lower(trim(member_email))),
  check (member_user_id is null or member_user_id <> owner_user_id)
);

create unique index if not exists idx_finance_household_members_active_email
  on public.finance_household_members(lower(member_email))
  where revoked_at is null;

create unique index if not exists idx_finance_household_members_active_user
  on public.finance_household_members(member_user_id)
  where member_user_id is not null and revoked_at is null;

create index if not exists idx_finance_household_members_owner
  on public.finance_household_members(owner_user_id)
  where revoked_at is null;

drop trigger if exists trg_finance_household_members_updated_at
  on public.finance_household_members;
create trigger trg_finance_household_members_updated_at
before update on public.finance_household_members
for each row execute function public.bump_finance_updated_at();

alter table public.finance_household_members enable row level security;
revoke all on table public.finance_household_members from anon, authenticated;

create or replace function public.can_access_finance_household(
  p_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() = p_owner_user_id
    or exists (
      select 1
      from public.finance_household_members household_member
      where household_member.owner_user_id = p_owner_user_id
        and household_member.revoked_at is null
        and (
          household_member.member_user_id = auth.uid()
          or (
            household_member.member_user_id is null
            and household_member.member_email = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
    );
$$;

create or replace function public.can_edit_finance_household(
  p_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() = p_owner_user_id
    or exists (
      select 1
      from public.finance_household_members household_member
      where household_member.owner_user_id = p_owner_user_id
        and household_member.role = 'editor'
        and household_member.revoked_at is null
        and (
          household_member.member_user_id = auth.uid()
          or (
            household_member.member_user_id is null
            and household_member.member_email = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
        )
    );
$$;

create or replace function public.get_my_finance_household_access()
returns table (
  owner_user_id uuid,
  role text,
  is_owner boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  shared_owner_id uuid;
  shared_role text;
begin
  if actor_id is null then
    raise exception 'Authentication is required.';
  end if;

  if exists (
    select 1
    from public.finance_household_members household_member
    where household_member.owner_user_id = actor_id
      and household_member.revoked_at is null
  ) then
    return query select actor_id, 'owner'::text, true;
    return;
  end if;

  select household_member.owner_user_id, household_member.role
  into shared_owner_id, shared_role
  from public.finance_household_members household_member
  where household_member.revoked_at is null
    and (
      household_member.member_user_id = actor_id
      or (
        household_member.member_user_id is null
        and actor_email <> ''
        and household_member.member_email = actor_email
      )
    )
  order by household_member.created_at
  limit 1;

  if shared_owner_id is not null then
    update public.finance_household_members household_member
    set member_user_id = actor_id,
        accepted_at = coalesce(household_member.accepted_at, timezone('utc', now()))
    where household_member.owner_user_id = shared_owner_id
      and household_member.revoked_at is null
      and household_member.member_user_id is null
      and household_member.member_email = actor_email;

    return query select shared_owner_id, shared_role, false;
    return;
  end if;

  return query select actor_id, 'owner'::text, true;
end;
$$;

revoke all on function public.can_access_finance_household(uuid) from public;
grant execute on function public.can_access_finance_household(uuid) to authenticated;
revoke all on function public.can_edit_finance_household(uuid) from public;
grant execute on function public.can_edit_finance_household(uuid) to authenticated;
revoke all on function public.get_my_finance_household_access() from public;
grant execute on function public.get_my_finance_household_access() to authenticated;

drop policy if exists finance_profiles_access on public.finance_profiles;
drop policy if exists finance_profiles_select_household on public.finance_profiles;
drop policy if exists finance_profiles_insert_owner on public.finance_profiles;
drop policy if exists finance_profiles_update_owner on public.finance_profiles;
drop policy if exists finance_profiles_delete_owner on public.finance_profiles;

create policy finance_profiles_select_household
on public.finance_profiles for select
using (public.can_access_finance_household(user_id));

create policy finance_profiles_insert_owner
on public.finance_profiles for insert
with check (user_id = auth.uid());

create policy finance_profiles_update_owner
on public.finance_profiles for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy finance_profiles_delete_owner
on public.finance_profiles for delete
using (user_id = auth.uid());

drop policy if exists finance_categories_access on public.finance_categories;
create policy finance_categories_access on public.finance_categories
for all
using (public.can_edit_finance_household(user_id))
with check (public.can_edit_finance_household(user_id));

drop policy if exists finance_budget_items_access on public.finance_budget_items;
create policy finance_budget_items_access on public.finance_budget_items
for all
using (public.can_edit_finance_household(user_id))
with check (public.can_edit_finance_household(user_id));

drop policy if exists finance_actual_entries_access on public.finance_actual_entries;
create policy finance_actual_entries_access on public.finance_actual_entries
for all
using (public.can_edit_finance_household(user_id))
with check (public.can_edit_finance_household(user_id));

drop policy if exists finance_balance_snapshots_access on public.finance_balance_snapshots;
create policy finance_balance_snapshots_access on public.finance_balance_snapshots
for all
using (public.can_edit_finance_household(user_id))
with check (public.can_edit_finance_household(user_id));

drop policy if exists finance_goals_access on public.finance_goals;
create policy finance_goals_access on public.finance_goals
for all
using (public.can_edit_finance_household(user_id))
with check (public.can_edit_finance_household(user_id));

drop policy if exists finance_mortgages_access on public.finance_mortgages;
create policy finance_mortgages_access on public.finance_mortgages
for all
using (public.can_edit_finance_household(user_id))
with check (public.can_edit_finance_household(user_id));

drop policy if exists finance_scenarios_access on public.finance_scenarios;
create policy finance_scenarios_access on public.finance_scenarios
for all
using (public.can_edit_finance_household(user_id))
with check (public.can_edit_finance_household(user_id));

create or replace function public.can_access_finance_scenario_change(
  row_user_id uuid,
  row_scenario_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.can_edit_finance_household(row_user_id)
    and exists (
      select 1
      from public.finance_scenarios scenario
      where scenario.id = row_scenario_id
        and scenario.user_id = row_user_id
    );
$$;

revoke all on function public.can_access_finance_scenario_change(uuid, uuid) from public;
grant execute on function public.can_access_finance_scenario_change(uuid, uuid) to authenticated;

drop policy if exists finance_scenario_changes_access on public.finance_scenario_changes;
create policy finance_scenario_changes_access on public.finance_scenario_changes
for all
using (public.can_access_finance_scenario_change(user_id, scenario_id))
with check (public.can_access_finance_scenario_change(user_id, scenario_id));

drop policy if exists finance_month_reconciliations_select on public.finance_month_reconciliations;
create policy finance_month_reconciliations_select
on public.finance_month_reconciliations for select
using (public.can_access_finance_household(user_id));

drop policy if exists finance_month_reconciliations_insert on public.finance_month_reconciliations;
create policy finance_month_reconciliations_insert
on public.finance_month_reconciliations for insert
with check (public.can_edit_finance_household(user_id) and status = 'draft');

drop policy if exists finance_month_reconciliations_update_draft on public.finance_month_reconciliations;
create policy finance_month_reconciliations_update_draft
on public.finance_month_reconciliations for update
using (public.can_edit_finance_household(user_id) and status = 'draft')
with check (public.can_edit_finance_household(user_id) and status = 'draft');

drop policy if exists finance_month_reconciliations_delete_draft on public.finance_month_reconciliations;
create policy finance_month_reconciliations_delete_draft
on public.finance_month_reconciliations for delete
using (public.can_edit_finance_household(user_id));

drop policy if exists finance_month_reconciliation_lines_select on public.finance_month_reconciliation_lines;
create policy finance_month_reconciliation_lines_select
on public.finance_month_reconciliation_lines for select
using (public.can_access_finance_household(user_id));

drop policy if exists finance_month_reconciliation_lines_insert on public.finance_month_reconciliation_lines;
create policy finance_month_reconciliation_lines_insert
on public.finance_month_reconciliation_lines for insert
with check (
  public.can_edit_finance_household(user_id)
  and exists (
    select 1
    from public.finance_month_reconciliations parent
    where parent.id = finance_month_reconciliation_lines.reconciliation_id
      and parent.user_id = finance_month_reconciliation_lines.user_id
      and parent.status = 'draft'
  )
);

drop policy if exists finance_month_reconciliation_lines_update on public.finance_month_reconciliation_lines;
create policy finance_month_reconciliation_lines_update
on public.finance_month_reconciliation_lines for update
using (
  public.can_edit_finance_household(user_id)
  and exists (
    select 1
    from public.finance_month_reconciliations parent
    where parent.id = finance_month_reconciliation_lines.reconciliation_id
      and parent.user_id = finance_month_reconciliation_lines.user_id
      and parent.status = 'draft'
  )
)
with check (
  public.can_edit_finance_household(user_id)
  and exists (
    select 1
    from public.finance_month_reconciliations parent
    where parent.id = finance_month_reconciliation_lines.reconciliation_id
      and parent.user_id = finance_month_reconciliation_lines.user_id
      and parent.status = 'draft'
  )
);

drop policy if exists finance_month_reconciliation_lines_delete on public.finance_month_reconciliation_lines;
create policy finance_month_reconciliation_lines_delete
on public.finance_month_reconciliation_lines for delete
using (
  public.can_edit_finance_household(user_id)
  and exists (
    select 1
    from public.finance_month_reconciliations parent
    where parent.id = finance_month_reconciliation_lines.reconciliation_id
      and parent.user_id = finance_month_reconciliation_lines.user_id
      and parent.status = 'draft'
  )
);

create or replace function public.finalize_finance_month_reconciliation(
  p_reconciliation_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid
)
returns public.finance_month_reconciliations
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  target_row public.finance_month_reconciliations;
  explained_pence bigint;
  monthly_variance_pence bigint;
  residual_pence bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select * into target_row
  from public.finance_month_reconciliations
  where id = p_reconciliation_id
    and public.can_edit_finance_household(user_id)
  for update;

  if not found then
    raise exception 'Reconciliation month not found.';
  end if;
  if target_row.status = 'finalized' and target_row.finalize_token = p_idempotency_key then
    return target_row;
  end if;
  if target_row.status <> 'draft' then
    raise exception 'This month is already finalized. Reopen it before making changes.';
  end if;
  if target_row.version <> p_expected_version then
    raise exception 'This month changed in another tab. Refresh and try again.';
  end if;
  if target_row.month >= date_trunc('month', timezone('Europe/London', now()))::date then
    raise exception 'Only completed months can be finalized.';
  end if;
  if target_row.actual_opening_cash_pence is null or target_row.actual_closing_cash_pence is null then
    raise exception 'Add both the opening and closing savings balances.';
  end if;
  if target_row.planned_opening_cash_pence is null
    or target_row.planned_income_pence is null
    or target_row.planned_expense_pence is null
    or target_row.planned_closing_cash_pence is null then
    raise exception 'Refresh the planned month before finalizing.';
  end if;

  select coalesce(sum(variance_pence), 0) into explained_pence
  from public.finance_month_reconciliation_lines
  where reconciliation_id = target_row.id and user_id = target_row.user_id;

  monthly_variance_pence :=
    (target_row.actual_closing_cash_pence - target_row.actual_opening_cash_pence)
    - (target_row.planned_income_pence - target_row.planned_expense_pence);
  residual_pence := monthly_variance_pence - explained_pence;

  if abs(residual_pence) > 1 then
    raise exception 'There is still an unexplained difference of % pence.', residual_pence;
  end if;

  update public.finance_month_reconciliations
  set status = 'finalized',
      finalized_at = timezone('utc', now()),
      finalize_token = p_idempotency_key,
      version = version + 1
  where id = target_row.id
  returning * into target_row;

  insert into public.finance_balance_snapshots (
    user_id,
    as_of_month,
    cash_balance_pence,
    note
  ) values (
    target_row.user_id,
    target_row.month,
    target_row.actual_closing_cash_pence,
    'Finalized monthly reconciliation'
  )
  on conflict (user_id, as_of_month)
  do update set
    cash_balance_pence = excluded.cash_balance_pence,
    note = excluded.note;

  return target_row;
end;
$$;

create or replace function public.reopen_finance_month_reconciliation(
  p_reconciliation_id uuid,
  p_expected_version integer
)
returns public.finance_month_reconciliations
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  target_row public.finance_month_reconciliations;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select * into target_row
  from public.finance_month_reconciliations
  where id = p_reconciliation_id
    and public.can_edit_finance_household(user_id)
  for update;

  if not found then
    raise exception 'Reconciliation month not found.';
  end if;
  if target_row.version <> p_expected_version then
    raise exception 'This month changed in another tab. Refresh and try again.';
  end if;
  if target_row.status = 'draft' then
    return target_row;
  end if;

  update public.finance_month_reconciliations
  set status = 'draft',
      finalized_at = null,
      finalize_token = null,
      version = version + 1
  where id = target_row.id
  returning * into target_row;

  return target_row;
end;
$$;

revoke all on function public.finalize_finance_month_reconciliation(uuid, integer, uuid) from public;
grant execute on function public.finalize_finance_month_reconciliation(uuid, integer, uuid) to authenticated;
revoke all on function public.reopen_finance_month_reconciliation(uuid, integer) from public;
grant execute on function public.reopen_finance_month_reconciliation(uuid, integer) to authenticated;

do $$
declare
  finance_owner_id uuid;
  invited_user_id uuid;
begin
  select users.id
  into finance_owner_id
  from auth.users users
  where lower(users.email) = 'galben.dorin@yahoo.com'
  order by users.created_at
  limit 1;

  if finance_owner_id is null then
    raise exception 'Finance owner account galben.dorin@yahoo.com was not found.';
  end if;

  select users.id
  into invited_user_id
  from auth.users users
  where lower(users.email) = 'irina.urmanschi@gmail.com'
  order by users.created_at
  limit 1;

  insert into public.finance_household_members as existing_member (
    owner_user_id,
    member_user_id,
    member_email,
    role,
    accepted_at,
    revoked_at
  ) values (
    finance_owner_id,
    invited_user_id,
    'irina.urmanschi@gmail.com',
    'editor',
    case when invited_user_id is null then null else timezone('utc', now()) end,
    null
  )
  on conflict (owner_user_id, member_email)
  do update set
    member_user_id = coalesce(excluded.member_user_id, existing_member.member_user_id),
    role = 'editor',
    accepted_at = coalesce(existing_member.accepted_at, excluded.accepted_at),
    revoked_at = null;
end;
$$;

commit;
