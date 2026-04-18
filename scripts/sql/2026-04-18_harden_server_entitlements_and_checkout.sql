begin;

create extension if not exists pgcrypto;

alter table public.user_profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_platform_admin boolean not null default false,
  add column if not exists household_tools_enabled boolean not null default false,
  add column if not exists platform_ai_enabled boolean not null default true;

create table if not exists public.ai_generation_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('platform', 'byok')),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ai_generation_reservations_user_status_created
  on public.ai_generation_reservations(user_id, status, created_at desc);

create table if not exists public.billing_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  price_id text not null,
  stripe_session_id text,
  session_url text,
  stripe_customer_id text,
  failure_reason text,
  status text not null default 'initiated' check (status in ('initiated', 'ready', 'failed', 'expired', 'completed')),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '1 hour'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_billing_checkout_sessions_active_user
  on public.billing_checkout_sessions(user_id)
  where status in ('initiated', 'ready');

create unique index if not exists idx_billing_checkout_sessions_stripe_session
  on public.billing_checkout_sessions(stripe_session_id)
  where stripe_session_id is not null;

create or replace function public.bump_ai_generation_reservations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_ai_generation_reservations_updated_at on public.ai_generation_reservations;
create trigger trg_ai_generation_reservations_updated_at
before update on public.ai_generation_reservations
for each row
execute function public.bump_ai_generation_reservations_updated_at();

create or replace function public.bump_billing_checkout_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_billing_checkout_sessions_updated_at on public.billing_checkout_sessions;
create trigger trg_billing_checkout_sessions_updated_at
before update on public.billing_checkout_sessions
for each row
execute function public.bump_billing_checkout_sessions_updated_at();

alter table public.ai_generation_reservations enable row level security;
alter table public.billing_checkout_sessions enable row level security;

create or replace function public.plan_max_projects(target_plan text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(target_plan, 'starter'))
    when 'starter' then 3
    else 999
  end
$$;

create or replace function public.plan_task_hard_limit(target_plan text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(target_plan, 'starter'))
    when 'starter' then 35
    when 'pro' then 500
    when 'team' then 999
    else 999
  end
$$;

create or replace function public.plan_ai_reports_per_month(target_plan text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(target_plan, 'starter'))
    when 'trial' then 100
    when 'pro' then 100
    when 'team' then 999
    else 0
  end
$$;

create or replace function public.project_collaborator_seat_limit()
returns integer
language sql
immutable
as $$
  select 5
$$;

create or replace function public.normalize_shopping_title(input_title text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(input_title, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.resolve_profile_access_plan(
  profile_row public.user_profiles,
  now_ts timestamptz default timezone('utc', now())
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  subscription_status text := lower(coalesce(profile_row.subscription_status, ''));
begin
  if profile_row.id is null then
    return 'starter';
  end if;

  if coalesce(profile_row.is_admin, false) or coalesce(profile_row.is_platform_admin, false) then
    return 'team';
  end if;

  if subscription_status in ('active', 'trialing', 'past_due') and profile_row.plan = 'pro' then
    return 'pro';
  end if;

  if profile_row.plan = 'trial' then
    if profile_row.trial_ends is not null and profile_row.trial_ends > now_ts then
      return 'trial';
    end if;
    return 'starter';
  end if;

  if profile_row.plan = 'team' then
    return 'team';
  end if;

  if profile_row.plan = 'pro' then
    return 'pro';
  end if;

  return 'starter';
end;
$$;

create or replace function public.get_or_create_user_profile(target_user_id uuid)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.user_profiles%rowtype;
  now_ts timestamptz := timezone('utc', now());
  month_start timestamptz := (date_trunc('month', now_ts at time zone 'utc') at time zone 'utc');
begin
  if target_user_id is null then
    raise exception 'User ID is required';
  end if;

  select *
  into profile_row
  from public.user_profiles
  where id = target_user_id;

  if not found then
    insert into public.user_profiles (
      id,
      plan,
      subscription_status,
      trial_start,
      trial_ends,
      ai_reports_used,
      ai_reports_reset_at,
      is_admin,
      is_platform_admin,
      household_tools_enabled,
      platform_ai_enabled,
      created_at,
      updated_at
    ) values (
      target_user_id,
      'trial',
      'trialing',
      now_ts,
      now_ts + interval '90 days',
      0,
      month_start,
      false,
      false,
      false,
      true,
      now_ts,
      now_ts
    )
    on conflict (id) do nothing;

    select *
    into profile_row
    from public.user_profiles
    where id = target_user_id;
  end if;

  if profile_row.ai_reports_reset_at is null or profile_row.ai_reports_reset_at < month_start then
    update public.user_profiles
    set
      ai_reports_used = 0,
      ai_reports_reset_at = month_start,
      updated_at = now_ts
    where id = target_user_id
    returning * into profile_row;
  end if;

  return profile_row;
end;
$$;

create or replace function public.get_or_create_current_user_profile()
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  return public.get_or_create_user_profile(current_user_id);
end;
$$;

create or replace function public.increment_current_user_ai_reports()
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Compatibility shim: server-side AI handlers now consume quota atomically.
  return public.get_or_create_user_profile(current_user_id);
end;
$$;

create or replace function public.resolve_user_access_plan(
  target_user_id uuid,
  now_ts timestamptz default timezone('utc', now())
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.user_profiles%rowtype;
begin
  profile_row := public.get_or_create_user_profile(target_user_id);
  return public.resolve_profile_access_plan(profile_row, now_ts);
end;
$$;

create or replace function public.claim_ai_generation_allowance(
  target_user_id uuid,
  usage_source text default 'byok'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_source text := lower(coalesce(usage_source, 'byok'));
  profile_row public.user_profiles%rowtype;
  effective_plan text;
  ai_limit integer;
  reserved_count integer;
  reservation_row public.ai_generation_reservations%rowtype;
  now_ts timestamptz := timezone('utc', now());
begin
  if target_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'missing_user'
    );
  end if;

  if normalized_source not in ('platform', 'byok') then
    normalized_source := 'byok';
  end if;

  profile_row := public.get_or_create_user_profile(target_user_id);

  update public.ai_generation_reservations
  set
    status = 'released',
    updated_at = now_ts
  where user_id = target_user_id
    and status = 'reserved'
    and updated_at < (now_ts - interval '30 minutes');

  select *
  into profile_row
  from public.user_profiles
  where id = target_user_id
  for update;

  effective_plan := public.resolve_profile_access_plan(profile_row, now_ts);
  ai_limit := public.plan_ai_reports_per_month(effective_plan);

  if normalized_source = 'platform' and not coalesce(profile_row.platform_ai_enabled, true) then
    return jsonb_build_object(
      'ok', false,
      'code', 'platform_ai_disabled',
      'effective_plan', effective_plan,
      'remaining', 0
    );
  end if;

  if ai_limit <= 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'ai_not_included',
      'effective_plan', effective_plan,
      'remaining', 0
    );
  end if;

  select count(*)
  into reserved_count
  from public.ai_generation_reservations
  where user_id = target_user_id
    and status = 'reserved'
    and created_at >= coalesce(profile_row.ai_reports_reset_at, profile_row.created_at, now_ts);

  if coalesce(profile_row.ai_reports_used, 0) + reserved_count >= ai_limit then
    return jsonb_build_object(
      'ok', false,
      'code', 'ai_quota_exceeded',
      'effective_plan', effective_plan,
      'limit', ai_limit,
      'remaining', 0
    );
  end if;

  insert into public.ai_generation_reservations (
    user_id,
    source,
    status
  ) values (
    target_user_id,
    normalized_source,
    'reserved'
  )
  returning * into reservation_row;

  return jsonb_build_object(
    'ok', true,
    'reservation_id', reservation_row.id,
    'effective_plan', effective_plan,
    'limit', ai_limit,
    'remaining', greatest(ai_limit - (coalesce(profile_row.ai_reports_used, 0) + reserved_count + 1), 0)
  );
end;
$$;

create or replace function public.finalize_ai_generation_allowance(target_reservation_id uuid)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.ai_generation_reservations%rowtype;
  profile_row public.user_profiles%rowtype;
  now_ts timestamptz := timezone('utc', now());
begin
  if target_reservation_id is null then
    raise exception 'Reservation ID is required';
  end if;

  select *
  into reservation_row
  from public.ai_generation_reservations
  where id = target_reservation_id
  for update;

  if not found then
    raise exception 'AI reservation not found';
  end if;

  profile_row := public.get_or_create_user_profile(reservation_row.user_id);

  if reservation_row.status = 'reserved' then
    update public.ai_generation_reservations
    set
      status = 'consumed',
      updated_at = now_ts
    where id = reservation_row.id;

    update public.user_profiles
    set
      ai_reports_used = coalesce(ai_reports_used, 0) + 1,
      updated_at = now_ts
    where id = reservation_row.user_id
    returning * into profile_row;
  end if;

  return profile_row;
end;
$$;

create or replace function public.release_ai_generation_allowance(target_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.ai_generation_reservations%rowtype;
  now_ts timestamptz := timezone('utc', now());
begin
  if target_reservation_id is null then
    return false;
  end if;

  select *
  into reservation_row
  from public.ai_generation_reservations
  where id = target_reservation_id
  for update;

  if not found then
    return false;
  end if;

  if reservation_row.status = 'reserved' then
    update public.ai_generation_reservations
    set
      status = 'released',
      updated_at = now_ts
    where id = reservation_row.id;
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.enforce_project_creation_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_profile public.user_profiles%rowtype;
  effective_plan text;
  max_projects integer;
  owned_project_count integer;
  existing_project_id uuid := case when tg_op = 'UPDATE' then old.id else null end;
begin
  if new.user_id is null then
    raise exception using errcode = 'P0001', message = 'PROJECT_OWNER_REQUIRED';
  end if;

  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then
    return new;
  end if;

  owner_profile := public.get_or_create_user_profile(new.user_id);
  effective_plan := public.resolve_profile_access_plan(owner_profile, timezone('utc', now()));
  max_projects := public.plan_max_projects(effective_plan);

  if max_projects < 999 then
    select count(*)
    into owned_project_count
    from public.projects p
    where p.user_id = new.user_id
      and (existing_project_id is null or p.id <> existing_project_id);

    if owned_project_count >= max_projects then
      raise exception using errcode = 'P0001', message = format('PROJECT_QUOTA_EXCEEDED:%s', max_projects);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_enforce_creation_quota on public.projects;
create trigger trg_projects_enforce_creation_quota
before insert or update of user_id on public.projects
for each row
execute function public.enforce_project_creation_quota();

create or replace function public.enforce_project_task_limit_and_household_name_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_profile public.user_profiles%rowtype;
  effective_plan text;
  task_limit integer;
  task_count integer := 0;
  normalized_name text := public.normalize_shopping_title(new.name);
  existing_named_project_id uuid;
begin
  if new.user_id is null then
    raise exception using errcode = 'P0001', message = 'PROJECT_OWNER_REQUIRED';
  end if;

  owner_profile := public.get_or_create_user_profile(new.user_id);
  effective_plan := public.resolve_profile_access_plan(owner_profile, timezone('utc', now()));
  task_limit := public.plan_task_hard_limit(effective_plan);

  if jsonb_typeof(coalesce(new.tasks, '[]'::jsonb)) = 'array' then
    task_count := jsonb_array_length(coalesce(new.tasks, '[]'::jsonb));
  end if;

  if task_count > task_limit then
    raise exception using errcode = 'P0001', message = format('PROJECT_TASK_LIMIT_EXCEEDED:%s', task_limit);
  end if;

  if normalized_name = 'shopping list' then
    select p.id
    into existing_named_project_id
    from public.projects p
    where p.user_id = new.user_id
      and public.normalize_shopping_title(p.name) = 'shopping list'
      and (tg_op = 'INSERT' or p.id <> old.id)
    order by p.created_at asc, p.id asc
    limit 1;

    if existing_named_project_id is not null then
      raise exception using errcode = 'P0001', message = 'SHOPPING_LIST_PROJECT_ALREADY_EXISTS';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_projects_enforce_task_limit on public.projects;
create trigger trg_projects_enforce_task_limit
before insert or update of name, tasks, user_id on public.projects
for each row
execute function public.enforce_project_task_limit_and_household_name_guard();

create or replace function public.create_project_with_limits(
  target_project_id uuid,
  target_name text,
  target_tasks jsonb default '[]'::jsonb,
  target_registers jsonb default '{}'::jsonb,
  target_tracker jsonb default '[]'::jsonb,
  target_status_report jsonb default '{}'::jsonb,
  target_baseline jsonb default null,
  target_is_demo boolean default false
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  created_project public.projects%rowtype;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if coalesce(btrim(target_name), '') = '' then
    raise exception using errcode = 'P0001', message = 'PROJECT_NAME_REQUIRED';
  end if;

  insert into public.projects (
    id,
    user_id,
    name,
    tasks,
    registers,
    tracker,
    status_report,
    baseline,
    is_demo
  ) values (
    coalesce(target_project_id, gen_random_uuid()),
    current_user_id,
    btrim(target_name),
    coalesce(target_tasks, '[]'::jsonb),
    coalesce(target_registers, '{}'::jsonb),
    coalesce(target_tracker, '[]'::jsonb),
    coalesce(target_status_report, '{}'::jsonb),
    target_baseline,
    coalesce(target_is_demo, false)
  )
  returning * into created_project;

  return created_project;
end;
$$;

create or replace function public.enforce_project_collaborator_seat_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_user_id uuid;
  seat_limit integer := public.project_collaborator_seat_limit();
  active_slot_count integer := 0;
  normalized_email text := lower(btrim(coalesce(new.member_email, '')));
  existing_member_id uuid := case when tg_table_name = 'project_members' and tg_op = 'UPDATE' then old.id else null end;
  existing_invite_id uuid := case when tg_table_name = 'project_member_invites' and tg_op = 'UPDATE' then old.id else null end;
begin
  owner_user_id := public.project_owner_id(new.project_id);

  if owner_user_id is null then
    raise exception using errcode = 'P0001', message = 'PROJECT_NOT_FOUND';
  end if;

  if new.invited_by_user_id is null or new.invited_by_user_id <> owner_user_id then
    raise exception using errcode = 'P0001', message = 'PROJECT_OWNER_REQUIRED_FOR_COLLABORATOR_WRITE';
  end if;

  if tg_table_name = 'project_members' and new.user_id = owner_user_id then
    raise exception using errcode = 'P0001', message = 'PROJECT_OWNER_CANNOT_BE_COLLABORATOR';
  end if;

  select count(*)
  into active_slot_count
  from public.project_members pm
  where pm.project_id = new.project_id
    and (existing_member_id is null or pm.id <> existing_member_id);

  active_slot_count := active_slot_count + (
    select count(*)
    from public.project_member_invites pmi
    where pmi.project_id = new.project_id
      and pmi.accepted_at is null
      and pmi.revoked_at is null
      and (
        existing_invite_id is null
        or pmi.id <> existing_invite_id
      )
      and (
        tg_table_name <> 'project_members'
        or pmi.member_email <> normalized_email
      )
  );

  if active_slot_count >= seat_limit then
    raise exception using errcode = 'P0001', message = format('PROJECT_COLLABORATOR_SEAT_CAP_EXCEEDED:%s', seat_limit);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_project_members_enforce_seat_cap on public.project_members;
create trigger trg_project_members_enforce_seat_cap
before insert or update of project_id, user_id, member_email, invited_by_user_id on public.project_members
for each row
execute function public.enforce_project_collaborator_seat_cap();

drop trigger if exists trg_project_member_invites_enforce_seat_cap on public.project_member_invites;
create trigger trg_project_member_invites_enforce_seat_cap
before insert or update of project_id, member_email, invited_by_user_id on public.project_member_invites
for each row
execute function public.enforce_project_collaborator_seat_cap();

create or replace function public.invite_project_member(
  target_project_id uuid,
  invite_email text,
  invited_by_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(coalesce(invite_email, '')));
  owner_email text;
  existing_profile_id uuid;
  seat_limit integer := public.project_collaborator_seat_limit();
  slot_count integer := 0;
begin
  if target_project_id is null or invited_by_user_id is null or normalized_email = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_request'
    );
  end if;

  if public.project_owner_id(target_project_id) is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'project_not_found'
    );
  end if;

  if public.project_owner_id(target_project_id) <> invited_by_user_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'forbidden'
    );
  end if;

  select lower(btrim(email))
  into owner_email
  from public.profiles
  where id = invited_by_user_id
  limit 1;

  if owner_email = normalized_email then
    return jsonb_build_object(
      'ok', false,
      'code', 'owner_email'
    );
  end if;

  if exists (
    select 1
    from public.project_members
    where project_id = target_project_id
      and member_email = normalized_email
  ) then
    return jsonb_build_object(
      'ok', true,
      'delivery', 'existing-access'
    );
  end if;

  if exists (
    select 1
    from public.project_member_invites
    where project_id = target_project_id
      and member_email = normalized_email
      and accepted_at is null
      and revoked_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'delivery', 'pending-access'
    );
  end if;

  select count(*)
  into slot_count
  from public.project_members pm
  where pm.project_id = target_project_id;

  slot_count := slot_count + (
    select count(*)
    from public.project_member_invites pmi
    where pmi.project_id = target_project_id
      and pmi.accepted_at is null
      and pmi.revoked_at is null
  );

  if slot_count >= seat_limit then
    return jsonb_build_object(
      'ok', false,
      'code', 'seat_cap_exceeded',
      'limit', seat_limit
    );
  end if;

  select id
  into existing_profile_id
  from public.profiles
  where lower(btrim(email)) = normalized_email
  order by created_at asc nulls last, id asc
  limit 1;

  if existing_profile_id = invited_by_user_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'owner_email'
    );
  end if;

  if existing_profile_id is not null then
    begin
      insert into public.project_members (
        project_id,
        user_id,
        member_email,
        role,
        invited_by_user_id
      ) values (
        target_project_id,
        existing_profile_id,
        normalized_email,
        'editor',
        invited_by_user_id
      );
    exception
      when unique_violation then
        return jsonb_build_object(
          'ok', true,
          'delivery', 'existing-access'
        );
      when others then
        if position('PROJECT_COLLABORATOR_SEAT_CAP_EXCEEDED:' in sqlerrm) = 1 then
          return jsonb_build_object(
            'ok', false,
            'code', 'seat_cap_exceeded',
            'limit', seat_limit
          );
        end if;
        raise;
    end;

    return jsonb_build_object(
      'ok', true,
      'delivery', 'existing-account'
    );
  end if;

  begin
    insert into public.project_member_invites (
      project_id,
      member_email,
      role,
      invited_by_user_id
    ) values (
      target_project_id,
      normalized_email,
      'editor',
      invited_by_user_id
    );
  exception
    when unique_violation then
      return jsonb_build_object(
        'ok', true,
        'delivery', 'pending-access'
      );
    when others then
      if position('PROJECT_COLLABORATOR_SEAT_CAP_EXCEEDED:' in sqlerrm) = 1 then
        return jsonb_build_object(
          'ok', false,
          'code', 'seat_cap_exceeded',
          'limit', seat_limit
        );
      end if;
      raise;
  end;

  return jsonb_build_object(
    'ok', true,
    'delivery', 'pending-signup'
  );
end;
$$;

create or replace function public.upsert_shopping_list_item(
  target_project_id uuid,
  target_title text,
  target_quantity_value numeric default null,
  target_quantity_unit text default '',
  target_source_type text default '',
  target_source_batch_id uuid default null,
  target_meta jsonb default '{}'::jsonb
)
returns public.manual_todos
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_title text := public.normalize_shopping_title(target_title);
  normalized_unit text := lower(btrim(coalesce(target_quantity_unit, '')));
  existing_row public.manual_todos%rowtype;
  saved_row public.manual_todos%rowtype;
  next_quantity numeric;
  next_unit text;
  safe_meta jsonb := case when jsonb_typeof(coalesce(target_meta, '{}'::jsonb)) = 'object' then coalesce(target_meta, '{}'::jsonb) else '{}'::jsonb end;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if target_project_id is null or normalized_title = '' then
    raise exception using errcode = 'P0001', message = 'SHOPPING_ITEM_INVALID';
  end if;

  if not public.can_access_project(target_project_id, current_user_id) then
    raise exception using errcode = 'P0001', message = 'PROJECT_ACCESS_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext(coalesce(target_project_id::text, '') || ':' || normalized_title));

  select *
  into existing_row
  from public.manual_todos mt
  where mt.project_id = target_project_id
    and mt.status <> 'Done'
    and public.normalize_shopping_title(mt.title) = normalized_title
  order by mt.created_at asc, mt.id asc
  limit 1
  for update;

  if found then
    next_quantity := existing_row.quantity_value;
    next_unit := coalesce(existing_row.quantity_unit, '');

    if target_quantity_value is not null then
      if existing_row.quantity_value is null then
        next_quantity := target_quantity_value;
        next_unit := coalesce(target_quantity_unit, '');
      elsif normalized_unit <> '' and lower(btrim(coalesce(existing_row.quantity_unit, ''))) = normalized_unit then
        next_quantity := round((existing_row.quantity_value + target_quantity_value)::numeric, 2);
        next_unit := coalesce(target_quantity_unit, '');
      elsif lower(btrim(coalesce(existing_row.quantity_unit, ''))) = '' and normalized_unit <> '' then
        next_quantity := target_quantity_value;
        next_unit := coalesce(target_quantity_unit, '');
      end if;
    end if;

    update public.manual_todos
    set
      quantity_value = next_quantity,
      quantity_unit = next_unit,
      source_type = case
        when coalesce(source_type, '') = '' then coalesce(target_source_type, '')
        else source_type
      end,
      source_batch_id = coalesce(source_batch_id, target_source_batch_id),
      meta = case
        when coalesce(meta, '{}'::jsonb) = '{}'::jsonb then safe_meta
        else meta
      end,
      updated_at = timezone('utc', now())
    where id = existing_row.id
    returning * into saved_row;

    return saved_row;
  end if;

  insert into public.manual_todos (
    user_id,
    project_id,
    title,
    due_date,
    owner_text,
    assignee_user_id,
    status,
    recurrence,
    completed_at,
    quantity_value,
    quantity_unit,
    source_type,
    source_batch_id,
    meta
  ) values (
    current_user_id,
    target_project_id,
    btrim(target_title),
    null,
    '',
    current_user_id,
    'Open',
    null,
    null,
    target_quantity_value,
    coalesce(target_quantity_unit, ''),
    coalesce(target_source_type, ''),
    target_source_batch_id,
    safe_meta
  )
  returning * into saved_row;

  return saved_row;
end;
$$;

create or replace function public.replace_meal_plan_grocery_batch(
  target_week_id uuid,
  target_shopping_project_id uuid,
  target_batch_id uuid default null,
  target_excluded_draft_signatures text[] default '{}'::text[],
  target_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  batch_row public.meal_plan_grocery_batches%rowtype;
  next_item jsonb;
  item_count integer := 0;
  quantity_value numeric;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if target_week_id is null or target_shopping_project_id is null then
    raise exception using errcode = 'P0001', message = 'MEAL_PLAN_BATCH_INVALID';
  end if;

  if not public.can_access_project(target_shopping_project_id, current_user_id) then
    raise exception using errcode = 'P0001', message = 'PROJECT_ACCESS_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.meal_plan_weeks weeks
    where weeks.id = target_week_id
      and weeks.shopping_project_id = target_shopping_project_id
  ) then
    raise exception using errcode = 'P0001', message = 'MEAL_PLAN_WEEK_NOT_FOUND';
  end if;

  insert into public.meal_plan_grocery_batches (
    id,
    user_id,
    week_id,
    shopping_project_id,
    status,
    excluded_draft_signatures
  ) values (
    target_batch_id,
    current_user_id,
    target_week_id,
    target_shopping_project_id,
    'approved',
    coalesce(target_excluded_draft_signatures, '{}'::text[])
  )
  on conflict (week_id)
  do update set
    shopping_project_id = excluded.shopping_project_id,
    status = 'approved',
    excluded_draft_signatures = excluded.excluded_draft_signatures,
    updated_at = timezone('utc', now())
  returning * into batch_row;

  perform pg_advisory_xact_lock(hashtext('meal-plan-batch:' || batch_row.id::text));

  delete from public.manual_todos
  where source_batch_id = batch_row.id;

  for next_item in
    select value
    from jsonb_array_elements(case when jsonb_typeof(coalesce(target_items, '[]'::jsonb)) = 'array' then coalesce(target_items, '[]'::jsonb) else '[]'::jsonb end)
  loop
    if public.normalize_shopping_title(next_item->>'title') = '' then
      continue;
    end if;

    quantity_value := case
      when coalesce(btrim(next_item->>'quantityValue'), '') = '' then null
      else (next_item->>'quantityValue')::numeric
    end;

    insert into public.manual_todos (
      user_id,
      project_id,
      title,
      due_date,
      owner_text,
      assignee_user_id,
      status,
      recurrence,
      completed_at,
      quantity_value,
      quantity_unit,
      source_type,
      source_batch_id,
      meta
    ) values (
      current_user_id,
      target_shopping_project_id,
      btrim(coalesce(next_item->>'title', '')),
      null,
      '',
      current_user_id,
      'Open',
      null,
      null,
      quantity_value,
      coalesce(next_item->>'quantityUnit', ''),
      'meal_plan',
      batch_row.id,
      jsonb_build_object(
      'rawText', next_item->>'rawText',
        'occurrenceCount', case
          when coalesce(btrim(next_item->>'occurrenceCount'), '') = '' then 0
          else (next_item->>'occurrenceCount')::int
        end,
        'sourceMeals', coalesce(next_item->'sourceMeals', '[]'::jsonb),
        'weekStartDate', next_item->>'weekStartDate'
      )
    );

    item_count := item_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'batch_id', batch_row.id,
    'count', item_count
  );
end;
$$;

create or replace function public.begin_checkout_session(
  target_user_id uuid,
  target_billing_interval text,
  target_price_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_interval text := lower(coalesce(target_billing_interval, ''));
  profile_row public.user_profiles%rowtype;
  existing_session public.billing_checkout_sessions%rowtype;
  checkout_row public.billing_checkout_sessions%rowtype;
  now_ts timestamptz := timezone('utc', now());
  subscription_status text;
  effective_plan text;
begin
  if target_user_id is null or normalized_interval not in ('monthly', 'annual') or coalesce(target_price_id, '') = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_request'
    );
  end if;

  profile_row := public.get_or_create_user_profile(target_user_id);

  select *
  into profile_row
  from public.user_profiles
  where id = target_user_id
  for update;

  update public.billing_checkout_sessions
  set
    status = 'expired',
    updated_at = now_ts
  where user_id = target_user_id
    and status in ('initiated', 'ready')
    and expires_at <= now_ts;

  subscription_status := lower(coalesce(profile_row.subscription_status, ''));
  effective_plan := public.resolve_profile_access_plan(profile_row, now_ts);
  if coalesce(profile_row.is_admin, false)
    or coalesce(profile_row.is_platform_admin, false)
    or effective_plan = 'team'
    or (
      effective_plan = 'pro'
      and subscription_status in ('active', 'trialing', 'past_due', 'unpaid')
    )
    or (
      coalesce(profile_row.subscription_id, '') <> ''
      and subscription_status in ('active', 'trialing', 'past_due', 'unpaid')
    )
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_subscribed'
    );
  end if;

  select *
  into existing_session
  from public.billing_checkout_sessions
  where user_id = target_user_id
    and status in ('initiated', 'ready')
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'checkout_id', existing_session.id,
      'session_url', existing_session.session_url,
      'status', existing_session.status,
      'reused', true
    );
  end if;

  insert into public.billing_checkout_sessions (
    user_id,
    billing_interval,
    price_id,
    status,
    expires_at
  ) values (
    target_user_id,
    normalized_interval,
    target_price_id,
    'initiated',
    now_ts + interval '1 hour'
  )
  returning * into checkout_row;

  return jsonb_build_object(
    'ok', true,
    'checkout_id', checkout_row.id,
    'status', checkout_row.status,
    'reused', false
  );
end;
$$;

create or replace function public.complete_checkout_session(
  target_checkout_id uuid,
  target_stripe_session_id text,
  target_session_url text,
  target_session_expires_at timestamptz,
  target_stripe_customer_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row public.billing_checkout_sessions%rowtype;
begin
  if target_checkout_id is null
    or coalesce(target_stripe_session_id, '') = ''
    or coalesce(target_session_url, '') = ''
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_request'
    );
  end if;

  select *
  into checkout_row
  from public.billing_checkout_sessions
  where id = target_checkout_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'checkout_not_found'
    );
  end if;

  if checkout_row.stripe_session_id is not null
    and checkout_row.stripe_session_id <> target_stripe_session_id
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'checkout_conflict',
      'session_url', checkout_row.session_url
    );
  end if;

  update public.billing_checkout_sessions
  set
    stripe_session_id = target_stripe_session_id,
    session_url = target_session_url,
    stripe_customer_id = coalesce(target_stripe_customer_id, stripe_customer_id),
    status = 'ready',
    expires_at = coalesce(target_session_expires_at, expires_at),
    failure_reason = null
  where id = target_checkout_id
  returning * into checkout_row;

  return jsonb_build_object(
    'ok', true,
    'checkout_id', checkout_row.id,
    'session_url', checkout_row.session_url,
    'status', checkout_row.status
  );
end;
$$;

create or replace function public.fail_checkout_session(
  target_checkout_id uuid,
  target_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row public.billing_checkout_sessions%rowtype;
begin
  if target_checkout_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_request'
    );
  end if;

  update public.billing_checkout_sessions
  set
    status = case
      when stripe_session_id is null then 'failed'
      else status
    end,
    failure_reason = coalesce(target_failure_reason, public.billing_checkout_sessions.failure_reason)
  where id = target_checkout_id
  returning * into checkout_row;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'checkout_not_found'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'checkout_id', checkout_row.id,
    'status', checkout_row.status
  );
end;
$$;

create or replace function public.complete_active_checkout_sessions_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.subscription_id, '') <> ''
    and lower(coalesce(new.subscription_status, '')) in ('active', 'trialing', 'past_due', 'unpaid')
  then
    update public.billing_checkout_sessions
    set
      status = 'completed',
      updated_at = timezone('utc', now())
    where user_id = new.id
      and status in ('initiated', 'ready');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_profiles_complete_checkout_sessions on public.user_profiles;
create trigger trg_user_profiles_complete_checkout_sessions
after insert or update of subscription_id, subscription_status on public.user_profiles
for each row
execute function public.complete_active_checkout_sessions_from_profile();

revoke all on function public.get_or_create_user_profile(uuid) from public;
grant execute on function public.get_or_create_user_profile(uuid) to service_role;

revoke all on function public.resolve_user_access_plan(uuid, timestamptz) from public;
grant execute on function public.resolve_user_access_plan(uuid, timestamptz) to service_role;

revoke all on function public.claim_ai_generation_allowance(uuid, text) from public;
grant execute on function public.claim_ai_generation_allowance(uuid, text) to service_role;

revoke all on function public.finalize_ai_generation_allowance(uuid) from public;
grant execute on function public.finalize_ai_generation_allowance(uuid) to service_role;

revoke all on function public.release_ai_generation_allowance(uuid) from public;
grant execute on function public.release_ai_generation_allowance(uuid) to service_role;

revoke all on function public.invite_project_member(uuid, text, uuid) from public;
grant execute on function public.invite_project_member(uuid, text, uuid) to service_role;

revoke all on function public.create_project_with_limits(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) from public;
grant execute on function public.create_project_with_limits(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;

revoke all on function public.upsert_shopping_list_item(uuid, text, numeric, text, text, uuid, jsonb) from public;
grant execute on function public.upsert_shopping_list_item(uuid, text, numeric, text, text, uuid, jsonb) to authenticated;

revoke all on function public.replace_meal_plan_grocery_batch(uuid, uuid, uuid, text[], jsonb) from public;
grant execute on function public.replace_meal_plan_grocery_batch(uuid, uuid, uuid, text[], jsonb) to authenticated;

revoke all on function public.begin_checkout_session(uuid, text, text) from public;
grant execute on function public.begin_checkout_session(uuid, text, text) to service_role;

revoke all on function public.complete_checkout_session(uuid, text, text, timestamptz, text) from public;
grant execute on function public.complete_checkout_session(uuid, text, text, timestamptz, text) to service_role;

revoke all on function public.fail_checkout_session(uuid, text) from public;
grant execute on function public.fail_checkout_session(uuid, text) to service_role;

revoke all on function public.get_or_create_current_user_profile() from public;
grant execute on function public.get_or_create_current_user_profile() to authenticated;

revoke all on function public.increment_current_user_ai_reports() from public;
grant execute on function public.increment_current_user_ai_reports() to authenticated;

commit;
