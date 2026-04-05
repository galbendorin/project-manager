create table if not exists public.api_rate_limits (
  rate_key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists api_rate_limits_reset_at_idx
  on public.api_rate_limits (reset_at);

create or replace function public.check_api_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  limit_count integer,
  reset_at timestamptz,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_count integer;
  v_reset timestamptz;
begin
  if p_key is null or btrim(p_key) = '' or p_max is null or p_max <= 0 or p_window_seconds is null or p_window_seconds <= 0 then
    return query
    select
      true,
      greatest(coalesce(p_max, 1) - 1, 0),
      greatest(coalesce(p_max, 1), 0),
      v_now,
      0;
    return;
  end if;

  insert into public.api_rate_limits as rl (
    rate_key,
    count,
    reset_at,
    updated_at
  )
  values (
    p_key,
    1,
    v_now + make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (rate_key) do update
    set count = case
      when rl.reset_at <= v_now then 1
      else rl.count + 1
    end,
    reset_at = case
      when rl.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else rl.reset_at
    end,
    updated_at = v_now
  returning api_rate_limits.count, api_rate_limits.reset_at
  into v_count, v_reset;

  return query
  select
    (v_count <= p_max),
    case
      when v_count <= p_max then greatest(p_max - v_count, 0)
      else 0
    end,
    p_max,
    v_reset,
    greatest(ceil(extract(epoch from (v_reset - v_now)))::integer, 1);
end;
$$;

revoke all on table public.api_rate_limits from anon, authenticated;
revoke all on function public.check_api_rate_limit(text, integer, integer) from anon, authenticated;
