-- Apply this migration before deploying the matching client release.
-- It replaces public email gating with server-owned entitlements and explicit family invitations.
-- Prerequisite: 2026-09-02_share_finance_household_with_irina.sql has already been applied.

begin;

alter table public.user_profiles
  add column if not exists finance_enabled boolean not null default false;

alter table public.finance_household_members
  add column if not exists invited_by_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists expires_at timestamptz null;

update public.finance_household_members
set accepted_at = coalesce(accepted_at, created_at),
    expires_at = null
where member_user_id is not null
  and revoked_at is null;

update public.finance_household_members
set expires_at = coalesce(expires_at, created_at + interval '14 days')
where member_user_id is null
  and accepted_at is null
  and revoked_at is null;

do $$
declare
  existing_finance_owner_id uuid;
begin
  for existing_finance_owner_id in
    select existing_owner.owner_user_id
    from (
      select household_member.owner_user_id
      from public.finance_household_members household_member
      where household_member.revoked_at is null
      union
      select finance_profile.user_id
      from public.finance_profiles finance_profile
    ) existing_owner
  loop
    perform public.get_or_create_user_profile(existing_finance_owner_id);

    update public.user_profiles
    set finance_enabled = true,
        updated_at = timezone('utc', now())
    where id = existing_finance_owner_id;
  end loop;
end;
$$;

update public.finance_household_members household_member
set revoked_at = timezone('utc', now())
where household_member.member_user_id is not null
  and household_member.accepted_at is not null
  and household_member.revoked_at is null
  and exists (
    select 1
    from public.user_profiles profile
    where profile.id = household_member.member_user_id
      and coalesce(profile.finance_enabled, false)
  );

drop index if exists public.idx_finance_household_members_active_email;
drop index if exists public.idx_finance_household_members_active_user;
drop index if exists public.idx_finance_household_members_pending_email;

create unique index if not exists idx_finance_household_members_pending_email
  on public.finance_household_members(lower(member_email))
  where member_user_id is null
    and accepted_at is null
    and revoked_at is null;

create unique index if not exists idx_finance_household_members_active_user
  on public.finance_household_members(member_user_id)
  where member_user_id is not null
    and accepted_at is not null
    and revoked_at is null;

create or replace function public.normalize_finance_access_email(input_email text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select lower(btrim(coalesce(input_email, '')))
$$;

create or replace function public.finance_household_member_limit()
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select 5
$$;

create or replace function public.finance_owner_is_enabled(p_owner_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.id = p_owner_user_id
      and coalesce(profile.finance_enabled, false)
  )
$$;

create or replace function public.can_access_finance_household(
  p_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.finance_owner_is_enabled(p_owner_user_id)
    and (
      auth.uid() = p_owner_user_id
      or (
        not public.finance_owner_is_enabled(auth.uid())
        and exists (
        select 1
        from public.finance_household_members household_member
        where household_member.owner_user_id = p_owner_user_id
          and household_member.member_user_id = auth.uid()
          and household_member.accepted_at is not null
          and household_member.revoked_at is null
        )
      )
    )
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
  select public.finance_owner_is_enabled(p_owner_user_id)
    and (
      auth.uid() = p_owner_user_id
      or (
        not public.finance_owner_is_enabled(auth.uid())
        and exists (
        select 1
        from public.finance_household_members household_member
        where household_member.owner_user_id = p_owner_user_id
          and household_member.member_user_id = auth.uid()
          and household_member.role = 'editor'
          and household_member.accepted_at is not null
          and household_member.revoked_at is null
        )
      )
    )
$$;

create or replace function public.can_manage_finance_household(
  p_owner_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() = p_owner_user_id
    and public.finance_owner_is_enabled(p_owner_user_id)
$$;

drop function if exists public.get_my_finance_household_access();
create function public.get_my_finance_household_access()
returns table (
  owner_user_id uuid,
  role text,
  is_owner boolean,
  has_access boolean,
  pending_invitation_id uuid,
  pending_invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text := public.normalize_finance_access_email(auth.jwt() ->> 'email');
  shared_owner_id uuid;
  shared_role text;
  invitation_id uuid;
  invitation_expires_at timestamptz;
begin
  if actor_id is null then
    raise exception 'Authentication is required.';
  end if;

  if public.finance_owner_is_enabled(actor_id) then
    return query
      select actor_id, 'owner'::text, true, true, null::uuid, null::timestamptz;
    return;
  end if;

  select household_member.owner_user_id, household_member.role
  into shared_owner_id, shared_role
  from public.finance_household_members household_member
  where household_member.member_user_id = actor_id
    and household_member.accepted_at is not null
    and household_member.revoked_at is null
    and public.finance_owner_is_enabled(household_member.owner_user_id)
  order by household_member.accepted_at
  limit 1;

  if shared_owner_id is not null then
    return query
      select shared_owner_id, shared_role, false, true, null::uuid, null::timestamptz;
    return;
  end if;

  select household_member.id, household_member.expires_at
  into invitation_id, invitation_expires_at
  from public.finance_household_members household_member
  where household_member.member_user_id is null
    and household_member.accepted_at is null
    and household_member.revoked_at is null
    and household_member.member_email = actor_email
    and household_member.expires_at > timezone('utc', now())
    and public.finance_owner_is_enabled(household_member.owner_user_id)
  order by household_member.created_at
  limit 1;

  return query
    select null::uuid, null::text, false, false, invitation_id, invitation_expires_at;
end;
$$;

create or replace function public.get_my_finance_household_members()
returns table (
  id uuid,
  member_email text,
  role text,
  status text,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not public.finance_owner_is_enabled(auth.uid()) then
    raise exception 'Only an enabled Finance owner can view household access.';
  end if;

  return query
    select
      household_member.id,
      household_member.member_email,
      household_member.role,
      case
        when household_member.member_user_id is not null
          and household_member.accepted_at is not null then 'active'
        when household_member.expires_at <= timezone('utc', now()) then 'expired'
        else 'pending'
      end,
      household_member.accepted_at,
      household_member.expires_at,
      household_member.created_at
    from public.finance_household_members household_member
    where household_member.owner_user_id = auth.uid()
      and household_member.revoked_at is null
      and (
        (
          household_member.member_user_id is not null
          and household_member.accepted_at is not null
        )
        or (
          household_member.member_user_id is null
          and household_member.accepted_at is null
          and household_member.expires_at > timezone('utc', now())
        )
      )
    order by
      case when household_member.accepted_at is not null then 0 else 1 end,
      household_member.created_at;
end;
$$;

create or replace function public.set_finance_access_for_email(
  p_actor_user_id uuid,
  p_target_email text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  normalized_email text := public.normalize_finance_access_email(p_target_email);
  target_user_id uuid;
begin
  if not exists (
    select 1
    from public.user_profiles profile
    where profile.id = p_actor_user_id
      and (
        coalesce(profile.is_admin, false)
        or coalesce(profile.is_platform_admin, false)
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if normalized_email = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;

  select account.id
  into target_user_id
  from auth.users account
  where lower(account.email) = normalized_email
  order by account.created_at
  limit 1;

  if target_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'user_not_found');
  end if;

  perform public.get_or_create_user_profile(target_user_id);

  if exists (
    select 1
    from public.finance_household_members household_member
    where household_member.member_user_id = target_user_id
      and household_member.accepted_at is not null
      and household_member.revoked_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'member_conflict');
  end if;

  if coalesce(p_enabled, false) then
    update public.finance_household_members household_member
    set revoked_at = timezone('utc', now())
    where household_member.member_user_id is null
      and household_member.accepted_at is null
      and household_member.revoked_at is null
      and household_member.member_email = normalized_email;
  end if;

  update public.user_profiles
  set finance_enabled = coalesce(p_enabled, false),
      updated_at = timezone('utc', now())
  where id = target_user_id;

  if not coalesce(p_enabled, false) then
    update public.finance_household_members household_member
    set revoked_at = timezone('utc', now())
    where household_member.owner_user_id = target_user_id
      and household_member.revoked_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', normalized_email,
    'enabled', coalesce(p_enabled, false)
  );
end;
$$;

create or replace function public.invite_finance_household_member(
  p_owner_user_id uuid,
  p_member_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  normalized_email text := public.normalize_finance_access_email(p_member_email);
  owner_email text;
  target_user_id uuid;
  existing_member public.finance_household_members%rowtype;
  saved_member public.finance_household_members%rowtype;
  reserved_seats integer;
begin
  if not public.finance_owner_is_enabled(p_owner_user_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if normalized_email = ''
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;

  select public.normalize_finance_access_email(account.email)
  into owner_email
  from auth.users account
  where account.id = p_owner_user_id;

  if owner_email = normalized_email then
    return jsonb_build_object('ok', false, 'code', 'owner_email');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text, 0));

  update public.finance_household_members household_member
  set revoked_at = timezone('utc', now())
  where household_member.member_user_id is null
    and household_member.accepted_at is null
    and household_member.revoked_at is null
    and household_member.expires_at <= timezone('utc', now())
    and household_member.member_email = normalized_email;

  select account.id
  into target_user_id
  from auth.users account
  where lower(account.email) = normalized_email
  order by account.created_at
  limit 1;

  if target_user_id is not null and public.finance_owner_is_enabled(target_user_id) then
    return jsonb_build_object('ok', false, 'code', 'target_owns_finance');
  end if;

  if target_user_id is not null and exists (
    select 1
    from public.finance_household_members household_member
    where household_member.member_user_id = target_user_id
      and household_member.accepted_at is not null
      and household_member.revoked_at is null
      and household_member.owner_user_id <> p_owner_user_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_linked');
  end if;

  if exists (
    select 1
    from public.finance_household_members household_member
    where household_member.member_email = normalized_email
      and household_member.owner_user_id <> p_owner_user_id
      and household_member.member_user_id is null
      and household_member.accepted_at is null
      and household_member.revoked_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_invited');
  end if;

  select *
  into existing_member
  from public.finance_household_members household_member
  where household_member.owner_user_id = p_owner_user_id
    and household_member.member_email = normalized_email
  limit 1;

  if found
    and existing_member.member_user_id is not null
    and existing_member.accepted_at is not null
    and existing_member.revoked_at is null then
    return jsonb_build_object('ok', true, 'delivery', 'existing_access');
  end if;

  select count(*)::integer
  into reserved_seats
  from public.finance_household_members household_member
  where household_member.owner_user_id = p_owner_user_id
    and household_member.revoked_at is null
    and (
      (household_member.member_user_id is not null and household_member.accepted_at is not null)
      or (
        household_member.member_user_id is null
        and household_member.accepted_at is null
        and household_member.expires_at > timezone('utc', now())
      )
    );

  if reserved_seats >= public.finance_household_member_limit() then
    return jsonb_build_object(
      'ok', false,
      'code', 'seat_cap_exceeded',
      'limit', public.finance_household_member_limit()
    );
  end if;

  if existing_member.id is not null then
    update public.finance_household_members
    set member_user_id = null,
        role = 'editor',
        invited_by_user_id = p_owner_user_id,
        accepted_at = null,
        revoked_at = null,
        expires_at = timezone('utc', now()) + interval '14 days'
    where id = existing_member.id
    returning * into saved_member;
  else
    insert into public.finance_household_members (
      owner_user_id,
      member_email,
      role,
      invited_by_user_id,
      expires_at
    ) values (
      p_owner_user_id,
      normalized_email,
      'editor',
      p_owner_user_id,
      timezone('utc', now()) + interval '14 days'
    )
    returning * into saved_member;
  end if;

  return jsonb_build_object(
    'ok', true,
    'delivery', 'pending',
    'invitation_id', saved_member.id,
    'expires_at', saved_member.expires_at
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'already_invited');
end;
$$;

create or replace function public.accept_finance_household_invitation(
  p_actor_user_id uuid,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_email text;
  actor_email_confirmed_at timestamptz;
  invitation public.finance_household_members%rowtype;
begin
  select
    public.normalize_finance_access_email(account.email),
    account.email_confirmed_at
  into actor_email, actor_email_confirmed_at
  from auth.users account
  where account.id = p_actor_user_id;

  if actor_email = '' or actor_email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'code', 'email_not_verified');
  end if;

  select *
  into invitation
  from public.finance_household_members household_member
  where household_member.id = p_invitation_id
  for update;

  if not found
    or invitation.member_user_id is not null
    or invitation.accepted_at is not null
    or invitation.revoked_at is not null
    or invitation.expires_at <= timezone('utc', now())
    or invitation.member_email <> actor_email
    or not public.finance_owner_is_enabled(invitation.owner_user_id) then
    return jsonb_build_object('ok', false, 'code', 'invitation_unavailable');
  end if;

  if public.finance_owner_is_enabled(p_actor_user_id) then
    return jsonb_build_object('ok', false, 'code', 'owner_conflict');
  end if;

  if exists (
    select 1
    from public.finance_household_members household_member
    where household_member.member_user_id = p_actor_user_id
      and household_member.accepted_at is not null
      and household_member.revoked_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'member_conflict');
  end if;

  update public.finance_household_members
  set member_user_id = p_actor_user_id,
      accepted_at = timezone('utc', now()),
      expires_at = null
  where id = invitation.id;

  return jsonb_build_object(
    'ok', true,
    'owner_user_id', invitation.owner_user_id,
    'role', invitation.role
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'member_conflict');
end;
$$;

create or replace function public.decline_finance_household_invitation(
  p_actor_user_id uuid,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_email text;
begin
  select public.normalize_finance_access_email(account.email)
  into actor_email
  from auth.users account
  where account.id = p_actor_user_id;

  update public.finance_household_members household_member
  set revoked_at = timezone('utc', now())
  where household_member.id = p_invitation_id
    and household_member.member_user_id is null
    and household_member.accepted_at is null
    and household_member.revoked_at is null
    and household_member.member_email = actor_email;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invitation_unavailable');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_finance_household_member(
  p_owner_user_id uuid,
  p_membership_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  removed_email text;
begin
  if not public.finance_owner_is_enabled(p_owner_user_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  update public.finance_household_members household_member
  set revoked_at = timezone('utc', now())
  where household_member.id = p_membership_id
    and household_member.owner_user_id = p_owner_user_id
    and household_member.revoked_at is null
  returning household_member.member_email into removed_email;

  if removed_email is null then
    return jsonb_build_object('ok', false, 'code', 'membership_not_found');
  end if;

  return jsonb_build_object('ok', true, 'email', removed_email);
end;
$$;

create or replace function public.leave_finance_household(
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  previous_owner_user_id uuid;
begin
  update public.finance_household_members household_member
  set revoked_at = timezone('utc', now())
  where household_member.member_user_id = p_actor_user_id
    and household_member.accepted_at is not null
    and household_member.revoked_at is null
  returning household_member.owner_user_id into previous_owner_user_id;

  if previous_owner_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'membership_not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.normalize_finance_access_email(text) from public;
grant execute on function public.normalize_finance_access_email(text) to authenticated, service_role;
revoke all on function public.finance_household_member_limit() from public;
grant execute on function public.finance_household_member_limit() to authenticated, service_role;
revoke all on function public.finance_owner_is_enabled(uuid) from public;
grant execute on function public.finance_owner_is_enabled(uuid) to authenticated, service_role;
revoke all on function public.can_access_finance_household(uuid) from public;
grant execute on function public.can_access_finance_household(uuid) to authenticated;
revoke all on function public.can_edit_finance_household(uuid) from public;
grant execute on function public.can_edit_finance_household(uuid) to authenticated;
revoke all on function public.can_manage_finance_household(uuid) from public;
grant execute on function public.can_manage_finance_household(uuid) to authenticated;
revoke all on function public.get_my_finance_household_access() from public;
grant execute on function public.get_my_finance_household_access() to authenticated;
revoke all on function public.get_my_finance_household_members() from public;
grant execute on function public.get_my_finance_household_members() to authenticated;
revoke all on function public.set_finance_access_for_email(uuid, text, boolean) from public;
grant execute on function public.set_finance_access_for_email(uuid, text, boolean) to service_role;
revoke all on function public.invite_finance_household_member(uuid, text) from public;
grant execute on function public.invite_finance_household_member(uuid, text) to service_role;
revoke all on function public.accept_finance_household_invitation(uuid, uuid) from public;
grant execute on function public.accept_finance_household_invitation(uuid, uuid) to service_role;
revoke all on function public.decline_finance_household_invitation(uuid, uuid) from public;
grant execute on function public.decline_finance_household_invitation(uuid, uuid) to service_role;
revoke all on function public.remove_finance_household_member(uuid, uuid) from public;
grant execute on function public.remove_finance_household_member(uuid, uuid) to service_role;
revoke all on function public.leave_finance_household(uuid) from public;
grant execute on function public.leave_finance_household(uuid) to service_role;

alter table public.finance_profiles enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_budget_items enable row level security;
alter table public.finance_actual_entries enable row level security;
alter table public.finance_balance_snapshots enable row level security;
alter table public.finance_goals enable row level security;
alter table public.finance_mortgages enable row level security;
alter table public.finance_scenarios enable row level security;
alter table public.finance_scenario_changes enable row level security;
alter table public.finance_month_reconciliations enable row level security;
alter table public.finance_month_reconciliation_lines enable row level security;

do $$
declare
  finance_table text;
  finance_policy record;
begin
  foreach finance_table in array array[
    'finance_profiles',
    'finance_categories',
    'finance_budget_items',
    'finance_actual_entries',
    'finance_balance_snapshots',
    'finance_goals',
    'finance_mortgages',
    'finance_scenarios',
    'finance_scenario_changes',
    'finance_month_reconciliations',
    'finance_month_reconciliation_lines'
  ]
  loop
    for finance_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = finance_table
        and policyname in (
          finance_table || '_access',
          finance_table || '_select',
          finance_table || '_select_household',
          finance_table || '_insert',
          finance_table || '_insert_owner',
          finance_table || '_insert_household',
          finance_table || '_update',
          finance_table || '_update_owner',
          finance_table || '_update_household',
          finance_table || '_update_draft',
          finance_table || '_delete',
          finance_table || '_delete_owner',
          finance_table || '_delete_household',
          finance_table || '_delete_draft'
        )
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        finance_policy.policyname,
        finance_table
      );
    end loop;
  end loop;
end;
$$;

create policy finance_profiles_select_household
on public.finance_profiles for select
using (public.can_access_finance_household(user_id));

create policy finance_profiles_insert_owner
on public.finance_profiles for insert
with check (public.can_manage_finance_household(user_id));

create policy finance_profiles_update_owner
on public.finance_profiles for update
using (public.can_manage_finance_household(user_id))
with check (public.can_manage_finance_household(user_id));

create policy finance_profiles_delete_owner
on public.finance_profiles for delete
using (public.can_manage_finance_household(user_id));

do $$
declare
  finance_table text;
begin
  foreach finance_table in array array[
    'finance_categories',
    'finance_budget_items',
    'finance_actual_entries',
    'finance_balance_snapshots',
    'finance_goals',
    'finance_mortgages',
    'finance_scenarios'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select using (public.can_access_finance_household(user_id))',
      finance_table || '_select_household',
      finance_table
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.can_edit_finance_household(user_id))',
      finance_table || '_insert_household',
      finance_table
    );
    execute format(
      'create policy %I on public.%I for update using (public.can_edit_finance_household(user_id)) with check (public.can_edit_finance_household(user_id))',
      finance_table || '_update_household',
      finance_table
    );
    execute format(
      'create policy %I on public.%I for delete using (public.can_manage_finance_household(user_id))',
      finance_table || '_delete_owner',
      finance_table
    );
  end loop;
end;
$$;

create or replace function public.can_access_finance_scenario_change(
  row_user_id uuid,
  row_scenario_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.can_access_finance_household(row_user_id)
    and exists (
      select 1
      from public.finance_scenarios scenario
      where scenario.id = row_scenario_id
        and scenario.user_id = row_user_id
    )
$$;

create or replace function public.can_edit_finance_scenario_change(
  row_user_id uuid,
  row_scenario_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.can_edit_finance_household(row_user_id)
    and exists (
      select 1
      from public.finance_scenarios scenario
      where scenario.id = row_scenario_id
        and scenario.user_id = row_user_id
    )
$$;

revoke all on function public.can_access_finance_scenario_change(uuid, uuid) from public;
grant execute on function public.can_access_finance_scenario_change(uuid, uuid) to authenticated;
revoke all on function public.can_edit_finance_scenario_change(uuid, uuid) from public;
grant execute on function public.can_edit_finance_scenario_change(uuid, uuid) to authenticated;

create policy finance_scenario_changes_select_household
on public.finance_scenario_changes for select
using (public.can_access_finance_scenario_change(user_id, scenario_id));

create policy finance_scenario_changes_insert_household
on public.finance_scenario_changes for insert
with check (public.can_edit_finance_scenario_change(user_id, scenario_id));

create policy finance_scenario_changes_update_household
on public.finance_scenario_changes for update
using (public.can_edit_finance_scenario_change(user_id, scenario_id))
with check (public.can_edit_finance_scenario_change(user_id, scenario_id));

create policy finance_scenario_changes_delete_owner
on public.finance_scenario_changes for delete
using (
  public.can_manage_finance_household(user_id)
  and exists (
    select 1
    from public.finance_scenarios scenario
    where scenario.id = finance_scenario_changes.scenario_id
      and scenario.user_id = finance_scenario_changes.user_id
  )
);

create policy finance_month_reconciliations_select_household
on public.finance_month_reconciliations for select
using (public.can_access_finance_household(user_id));

create policy finance_month_reconciliations_insert_household
on public.finance_month_reconciliations for insert
with check (public.can_edit_finance_household(user_id) and status = 'draft');

create policy finance_month_reconciliations_update_household
on public.finance_month_reconciliations for update
using (public.can_edit_finance_household(user_id) and status = 'draft')
with check (public.can_edit_finance_household(user_id) and status = 'draft');

create policy finance_month_reconciliations_delete_owner
on public.finance_month_reconciliations for delete
using (public.can_manage_finance_household(user_id));

create policy finance_month_reconciliation_lines_select_household
on public.finance_month_reconciliation_lines for select
using (public.can_access_finance_household(user_id));

create policy finance_month_reconciliation_lines_insert_household
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

create policy finance_month_reconciliation_lines_update_household
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

create policy finance_month_reconciliation_lines_delete_household
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

commit;

notify pgrst, 'reload schema';
