-- Atomic recurring manual_todos completion, server-side recurrence date math,
-- and DB-enforced occurrence identity.
-- Safe to apply before deploying the updated client; preserves existing RLS and project sharing rules.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.manual_todos
  add column if not exists recurrence_source_todo_id uuid null
  references public.manual_todos(id) on delete set null;

create unique index if not exists idx_manual_todos_unique_recurrence_source
  on public.manual_todos (recurrence_source_todo_id)
  where recurrence_source_todo_id is not null;

create or replace function public.next_recurring_todo_due_date_v1(
  p_base_date date,
  p_recurrence jsonb
) returns date
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  recurrence_type text := '';
  interval_raw text := '';
  parsed_interval integer := 1;
  next_date date;
  remaining integer;
begin
  if p_base_date is null or p_recurrence is null then
    return null;
  end if;

  if jsonb_typeof(p_recurrence) = 'string' then
    recurrence_type := lower(btrim(p_recurrence #>> '{}'));
    parsed_interval := 1;
  elsif jsonb_typeof(p_recurrence) = 'object' then
    recurrence_type := lower(btrim(coalesce(p_recurrence->>'type', '')));
    interval_raw := btrim(coalesce(p_recurrence->>'interval', ''));
    if interval_raw <> '' then
      begin
        if interval_raw::numeric > 0 then
          parsed_interval := greatest(1, least(floor(interval_raw::numeric)::integer, 1000));
        else
          parsed_interval := 1;
        end if;
      exception
        when invalid_text_representation or numeric_value_out_of_range then
          parsed_interval := 1;
      end;
    end if;
  else
    return null;
  end if;

  recurrence_type := case recurrence_type
    when 'weekday' then 'weekdays'
    when 'weekdays' then 'weekdays'
    when 'weekly' then 'weekly'
    when 'monthly' then 'monthly'
    when 'yearly' then 'yearly'
    when 'annual' then 'yearly'
    else ''
  end;

  if recurrence_type = '' then
    return null;
  end if;

  if recurrence_type = 'weekdays' then
    next_date := p_base_date;
    remaining := parsed_interval;
    while remaining > 0 loop
      next_date := next_date + 1;
      if extract(isodow from next_date) <= 5 then
        remaining := remaining - 1;
      end if;
    end loop;
    return next_date;
  end if;

  if recurrence_type = 'weekly' then
    return p_base_date + (parsed_interval * 7);
  end if;

  if recurrence_type = 'monthly' then
    return (p_base_date + pg_catalog.make_interval(months => parsed_interval))::date;
  end if;

  if recurrence_type = 'yearly' then
    return (p_base_date + pg_catalog.make_interval(years => parsed_interval))::date;
  end if;

  return null;
end;
$$;

drop function if exists public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid);

create or replace function public.complete_recurring_manual_todo_v1(
  p_todo_id uuid,
  p_fallback_date date default null,
  p_completed_at timestamptz default null,
  p_follow_up_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  effective_now timestamptz := timezone('utc', now());
  existing public.manual_todos%rowtype;
  updated_row public.manual_todos%rowtype;
  legacy_follow_up_row public.manual_todos%rowtype;
  follow_up_row public.manual_todos%rowtype;
  base_due_date date;
  computed_next_due_date date;
  target_follow_up_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if p_todo_id is null then
    raise exception using errcode = '22023', message = 'TODO_ID_REQUIRED';
  end if;

  if p_follow_up_id is not null and p_follow_up_id = p_todo_id then
    raise exception using errcode = '22023', message = 'FOLLOW_UP_ID_INVALID';
  end if;

  select *
  into existing
  from public.manual_todos
  where id = p_todo_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'TODO_ACCESS_REQUIRED';
  end if;

  if existing.status is distinct from 'Done' then
    update public.manual_todos
    set
      status = 'Done',
      completed_at = coalesce(existing.completed_at, p_completed_at, effective_now),
      updated_at = effective_now
    where id = existing.id
    returning * into updated_row;
  else
    updated_row := existing;
  end if;

  base_due_date := coalesce(updated_row.due_date, p_fallback_date, (effective_now at time zone 'utc')::date);
  computed_next_due_date := public.next_recurring_todo_due_date_v1(base_due_date, updated_row.recurrence);

  if computed_next_due_date is not null then
    select *
    into follow_up_row
    from public.manual_todos
    where recurrence_source_todo_id = updated_row.id
    limit 1;

    if not found then
      select *
      into legacy_follow_up_row
      from public.manual_todos
      where recurrence_source_todo_id is null
        and coalesce(meta->>'recurrenceSourceTodoId', '') = updated_row.id::text
        and project_id is not distinct from updated_row.project_id
        and id <> updated_row.id
      order by (p_follow_up_id is not null and id = p_follow_up_id) desc, created_at asc
      limit 1
      for update;

      if found then
        begin
          update public.manual_todos
          set recurrence_source_todo_id = updated_row.id
          where id = legacy_follow_up_row.id
            and recurrence_source_todo_id is null
          returning * into follow_up_row;
        exception
          when unique_violation then
            select *
            into follow_up_row
            from public.manual_todos
            where recurrence_source_todo_id = updated_row.id
            limit 1;
        end;

        if follow_up_row.id is null then
          select *
          into follow_up_row
          from public.manual_todos
          where recurrence_source_todo_id = updated_row.id
          limit 1;
        end if;
      end if;
    end if;

    if follow_up_row.id is null then
      target_follow_up_id := coalesce(p_follow_up_id, pg_catalog.gen_random_uuid());
      begin
        insert into public.manual_todos (
          id,
          user_id,
          project_id,
          title,
          description,
          due_date,
          owner_text,
          assignee_user_id,
          status,
          recurrence,
          kanban_column_id,
          kanban_position,
          meta,
          completed_at,
          recurrence_source_todo_id
        ) values (
          target_follow_up_id,
          actor_id,
          updated_row.project_id,
          coalesce(nullif(updated_row.title, ''), 'New Task'),
          coalesce(updated_row.description, ''),
          computed_next_due_date,
          coalesce(nullif(updated_row.owner_text, ''), 'PM'),
          coalesce(updated_row.assignee_user_id, actor_id),
          'Open',
          updated_row.recurrence,
          updated_row.kanban_column_id,
          0,
          jsonb_build_object('recurrenceSourceTodoId', updated_row.id::text),
          null,
          updated_row.id
        )
        returning * into follow_up_row;
      exception
        when unique_violation then
          select *
          into follow_up_row
          from public.manual_todos
          where recurrence_source_todo_id = updated_row.id
          limit 1;

          if follow_up_row.id is null then
            raise;
          end if;
      end;
    end if;

    if follow_up_row.id is null or follow_up_row.recurrence_source_todo_id is distinct from updated_row.id then
      raise exception using errcode = '23514', message = 'FOLLOW_UP_LINK_NOT_VERIFIED';
    end if;
  end if;

  return jsonb_build_object(
    'updated_todo', to_jsonb(updated_row),
    'follow_up_todo', case when follow_up_row.id is not null then to_jsonb(follow_up_row) else null end
  );
end;
$$;

revoke all on function public.next_recurring_todo_due_date_v1(date, jsonb) from public, anon, authenticated;
grant execute on function public.next_recurring_todo_due_date_v1(date, jsonb) to authenticated, service_role;

revoke all on function public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid) to authenticated, service_role;

commit;
