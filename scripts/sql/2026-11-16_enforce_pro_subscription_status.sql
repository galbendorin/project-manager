begin;

-- 0. Monotonic billing revision on public.user_profiles to guard concurrent webhook writes
alter table public.user_profiles
  add column if not exists billing_revision bigint not null default 0;

create or replace function public.bump_user_profile_billing_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan is distinct from old.plan
    or new.subscription_status is distinct from old.subscription_status
    or new.subscription_id is distinct from old.subscription_id
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.current_period_end is distinct from old.current_period_end
    or new.cancel_at_period_end is distinct from old.cancel_at_period_end
    or new.trial_ends is distinct from old.trial_ends
    or new.billing_revision is distinct from old.billing_revision
  then
    new.billing_revision := coalesce(old.billing_revision, 0) + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.bump_user_profile_billing_revision() from public, anon, authenticated;

drop trigger if exists trg_user_profiles_bump_billing_revision on public.user_profiles;
create trigger trg_user_profiles_bump_billing_revision
before update on public.user_profiles
for each row
execute function public.bump_user_profile_billing_revision();

-- 1. Enforce active/trialing/past_due subscription_status for Pro plan resolution
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

  if profile_row.plan = 'pro' then
    if subscription_status in ('active', 'trialing', 'past_due') then
      return 'pro';
    end if;
    return 'starter';
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

  return 'starter';
end;
$$;

-- 2. Include 'paused' in checkout duplicate-subscription guard so recoverable subscriptions
--    use the Stripe Billing Portal instead of starting a second subscription
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
      and subscription_status in ('active', 'trialing', 'past_due', 'unpaid', 'paused')
    )
    or (
      coalesce(profile_row.subscription_id, '') <> ''
      and subscription_status in ('active', 'trialing', 'past_due', 'unpaid', 'paused')
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

  if coalesce(profile_row.subscription_id, '') <> ''
    and subscription_status = 'incomplete'
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_subscribed'
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

revoke all on function public.begin_checkout_session(uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_checkout_session(uuid, text, text) to service_role;

create or replace function public.complete_active_checkout_sessions_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.subscription_id, '') <> ''
    and lower(coalesce(new.subscription_status, '')) in ('active', 'trialing', 'past_due', 'unpaid', 'paused')
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

revoke all on function public.complete_active_checkout_sessions_from_profile() from public, anon, authenticated;

-- 3. Preserve edits and task removals on existing projects above the task cap after a downgrade,
--    while blocking task count growth above task_limit (or new project / owner transfer above task_limit)
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
  old_task_count integer := 0;
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

  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then
    if jsonb_typeof(coalesce(old.tasks, '[]'::jsonb)) = 'array' then
      old_task_count := jsonb_array_length(coalesce(old.tasks, '[]'::jsonb));
    end if;

    if task_count > task_limit and task_count > old_task_count then
      raise exception using errcode = 'P0001', message = format('PROJECT_TASK_LIMIT_EXCEEDED:%s', task_limit);
    end if;
  else
    if task_count > task_limit then
      raise exception using errcode = 'P0001', message = format('PROJECT_TASK_LIMIT_EXCEEDED:%s', task_limit);
    end if;
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

revoke all on function public.enforce_project_task_limit_and_household_name_guard() from public, anon, authenticated;

-- 4. Post-condition verification block
do $$
declare
  sample_profile public.user_profiles%rowtype;
  now_ts timestamptz := '2026-11-16T00:00:00Z'::timestamptz;
  status_val text;
begin
  sample_profile.id := '00000000-0000-0000-0000-000000000001'::uuid;
  sample_profile.is_admin := false;
  sample_profile.is_platform_admin := false;
  sample_profile.plan := 'pro';

  foreach status_val in array array['active', 'trialing', 'past_due'] loop
    sample_profile.subscription_status := status_val;
    if public.resolve_profile_access_plan(sample_profile, now_ts) <> 'pro' then
      raise exception 'EXPECTED_PRO_FOR_STATUS:%', status_val;
    end if;
  end loop;

  foreach status_val in array array['unpaid', 'paused', 'canceled', 'incomplete', 'incomplete_expired', '', 'unknown_status'] loop
    sample_profile.subscription_status := status_val;
    if public.resolve_profile_access_plan(sample_profile, now_ts) <> 'starter' then
      raise exception 'EXPECTED_STARTER_FOR_STATUS:%', status_val;
    end if;
  end loop;

  sample_profile.subscription_status := null;
  if public.resolve_profile_access_plan(sample_profile, now_ts) <> 'starter' then
    raise exception 'EXPECTED_STARTER_FOR_NULL_STATUS';
  end if;

  if has_function_privilege('anon', 'public.begin_checkout_session(uuid, text, text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.begin_checkout_session(uuid, text, text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.begin_checkout_session(uuid, text, text)', 'EXECUTE')
  then
    raise exception 'BEGIN_CHECKOUT_SESSION_GRANTS_INVALID';
  end if;
end
$$;

commit;
