begin;

alter table public.user_profiles enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
  loop
    execute format('drop policy if exists %I on public.user_profiles', policy_record.policyname);
  end loop;
end
$$;

create policy "user_profiles_select_own"
  on public.user_profiles
  for select
  using (auth.uid() = id);

create or replace function public.get_or_create_current_user_profile()
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_row public.user_profiles%rowtype;
  now_ts timestamptz := timezone('utc', now());
  month_start timestamptz := date_trunc('month', now_ts);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into profile_row
  from public.user_profiles
  where id = current_user_id;

  if not found then
    insert into public.user_profiles (
      id,
      plan,
      subscription_status,
      trial_start,
      trial_ends,
      ai_reports_used,
      ai_reports_reset_at,
      created_at,
      updated_at
    ) values (
      current_user_id,
      'trial',
      'trialing',
      now_ts,
      now_ts + interval '90 days',
      0,
      month_start,
      now_ts,
      now_ts
    );

    select *
    into profile_row
    from public.user_profiles
    where id = current_user_id;
  end if;

  if profile_row.ai_reports_reset_at is null or profile_row.ai_reports_reset_at < month_start then
    update public.user_profiles
    set
      ai_reports_used = 0,
      ai_reports_reset_at = month_start,
      updated_at = now_ts
    where id = current_user_id
    returning * into profile_row;
  end if;

  return profile_row;
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
  profile_row public.user_profiles%rowtype;
  now_ts timestamptz := timezone('utc', now());
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select public.get_or_create_current_user_profile() into profile_row;

  update public.user_profiles
  set
    ai_reports_used = coalesce(ai_reports_used, 0) + 1,
    updated_at = now_ts
  where id = current_user_id
  returning * into profile_row;

  return profile_row;
end;
$$;

revoke all on function public.get_or_create_current_user_profile() from public;
grant execute on function public.get_or_create_current_user_profile() to authenticated;

revoke all on function public.increment_current_user_ai_reports() from public;
grant execute on function public.increment_current_user_ai_reports() to authenticated;

commit;
