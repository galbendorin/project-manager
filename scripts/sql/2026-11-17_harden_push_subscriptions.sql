-- Phase 2 hardening for public.push_subscriptions:
-- 1. Remove direct browser PostgREST policies so only server endpoints using
--    service_role can read or write push subscriptions after SSRF validation.
-- 2. Enforce HTTPS + matching subscription endpoint invariant at table level.
-- 3. Pin search_path = '' on bump_push_subscriptions_updated_at().

begin;

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant all on table public.push_subscriptions to service_role;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_valid_endpoint_chk;

alter table public.push_subscriptions
  add constraint push_subscriptions_valid_endpoint_chk
  check (
    endpoint ~ '^https://'
    and length(endpoint) <= 2048
    and subscription->>'endpoint' = endpoint
  );

create or replace function public.bump_push_subscriptions_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.bump_push_subscriptions_updated_at() from public, anon, authenticated;

do $$
declare
  rls_enabled boolean;
  policy_count integer;
  trigger_config text[];
begin
  select c.relrowsecurity
  into rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'push_subscriptions';

  if coalesce(rls_enabled, false) is not true then
    raise exception 'PUSH_SUBSCRIPTIONS_RLS_NOT_ENABLED';
  end if;

  select count(*)
  into policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'push_subscriptions';

  if policy_count <> 0 then
    raise exception 'PUSH_SUBSCRIPTIONS_UNEXPECTED_POLICIES:%', policy_count;
  end if;

  if has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
    or has_table_privilege('anon', 'public.push_subscriptions', 'INSERT')
    or has_table_privilege('anon', 'public.push_subscriptions', 'UPDATE')
    or has_table_privilege('anon', 'public.push_subscriptions', 'DELETE')
    or has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
    or has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT')
    or has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE')
    or has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE') then
    raise exception 'PUSH_SUBSCRIPTIONS_CLIENT_GRANTS_STILL_PRESENT';
  end if;

  if not has_table_privilege('service_role', 'public.push_subscriptions', 'SELECT')
    or not has_table_privilege('service_role', 'public.push_subscriptions', 'INSERT')
    or not has_table_privilege('service_role', 'public.push_subscriptions', 'UPDATE')
    or not has_table_privilege('service_role', 'public.push_subscriptions', 'DELETE') then
    raise exception 'PUSH_SUBSCRIPTIONS_SERVICE_ROLE_GRANTS_MISSING';
  end if;

  select p.proconfig
  into trigger_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'bump_push_subscriptions_updated_at';

  if not exists (
    select 1
    from unnest(coalesce(trigger_config, array[]::text[])) as cfg
    where cfg in ('search_path=', 'search_path=""')
  ) then
    raise exception 'PUSH_SUBSCRIPTIONS_TRIGGER_SEARCH_PATH_NOT_PINNED';
  end if;
end $$;

commit;
