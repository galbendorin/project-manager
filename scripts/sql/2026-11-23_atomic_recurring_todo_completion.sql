-- Atomic recurring manual_todos completion, server-side recurrence date math,
-- and DB-enforced occurrence identity.
-- Safe to apply before deploying the updated client; preserves existing RLS and project sharing rules.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.manual_todos
  add column if not exists recurrence_source_todo_id uuid null
  references public.manual_todos(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'manual_todos'
      and c.conname = 'manual_todos_recurrence_source_not_self'
  ) then
    alter table public.manual_todos
      add constraint manual_todos_recurrence_source_not_self
      check (recurrence_source_todo_id is null or recurrence_source_todo_id <> id);
  end if;
end
$$;

create unique index if not exists idx_manual_todos_unique_recurrence_source
  on public.manual_todos (recurrence_source_todo_id)
  where recurrence_source_todo_id is not null;

create or replace function public.recurring_todo_write_context_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return nullif(pg_catalog.current_setting('pmworkspace.recurring_todo_write', true), '')::jsonb;
exception when others then
  return null;
end;
$$;

drop trigger if exists trg_manual_todo_recurrence_link_guard_v1 on public.manual_todos;

with candidate_links as (
  select
    child.id as child_id,
    parent.id as parent_id,
    count(*) over (partition by parent.id) as candidate_count
  from public.manual_todos child
  join public.manual_todos parent
    on coalesce(child.meta->>'recurrenceSourceTodoId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and parent.id = (child.meta->>'recurrenceSourceTodoId')::uuid
  where child.recurrence_source_todo_id is null
    and child.id <> parent.id
    and parent.status = 'Done'
    and child.created_at >= parent.created_at
    and (
      (parent.project_id is not null and child.project_id = parent.project_id)
      or (parent.project_id is null and child.project_id is null and child.user_id = parent.user_id)
    )
    and not exists (
      select 1
      from public.manual_todos existing_link
      where existing_link.recurrence_source_todo_id = parent.id
    )
)
update public.manual_todos mt
set recurrence_source_todo_id = candidate_links.parent_id
from candidate_links
where mt.id = candidate_links.child_id
  and candidate_links.candidate_count = 1
  and mt.recurrence_source_todo_id is null;

create or replace function public.guard_manual_todo_recurrence_link_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  context_value jsonb;
  trusted boolean := false;
  parent_row public.manual_todos%rowtype;
  link_changed boolean;
  meta_link_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.recurrence_source_todo_id is null
      and not (coalesce(new.meta, '{}'::jsonb) ? 'recurrenceSourceTodoId') then
      return new;
    end if;

    context_value := public.recurring_todo_write_context_v1();
    trusted := (
      auth.uid() is not null
      and context_value->>'action' = 'complete_recurring'
      and context_value->>'actor' = auth.uid()::text
      and context_value->>'parentId' = coalesce(new.recurrence_source_todo_id::text, '')
      and context_value->>'followUpId' = coalesce(new.id::text, '')
    );
    if not coalesce(trusted, false) then
      raise exception using errcode = '22023', message = 'RECURRENCE_LINK_RESERVED';
    end if;

    if new.recurrence_source_todo_id is null
      or new.recurrence_source_todo_id = new.id
      or coalesce(new.meta->>'recurrenceSourceTodoId', '') <> new.recurrence_source_todo_id::text then
      raise exception using errcode = '23514', message = 'RECURRENCE_LINK_BOUNDARY_INVALID';
    end if;

    select *
    into parent_row
    from public.manual_todos
    where id = new.recurrence_source_todo_id;

    if not found
      or parent_row.status is distinct from 'Done'
      or not (
        (parent_row.project_id is not null and new.project_id = parent_row.project_id)
        or (parent_row.project_id is null and new.project_id is null and new.user_id = parent_row.user_id)
      ) then
      raise exception using errcode = '23514', message = 'RECURRENCE_LINK_BOUNDARY_INVALID';
    end if;

    return new;
  end if;

  link_changed := new.recurrence_source_todo_id is distinct from old.recurrence_source_todo_id;
  meta_link_changed := (coalesce(new.meta, '{}'::jsonb)->'recurrenceSourceTodoId')
    is distinct from (coalesce(old.meta, '{}'::jsonb)->'recurrenceSourceTodoId');

  if not link_changed and not meta_link_changed then
    return new;
  end if;

  if link_changed
    and not meta_link_changed
    and old.recurrence_source_todo_id is not null
    and new.recurrence_source_todo_id is null
    and not exists (
      select 1
      from public.manual_todos p
      where p.id = old.recurrence_source_todo_id
    ) then
    return new;
  end if;

  raise exception using errcode = '22023', message = 'RECURRENCE_LINK_IMMUTABLE';
end;
$$;

create trigger trg_manual_todo_recurrence_link_guard_v1
  before insert or update on public.manual_todos
  for each row execute function public.guard_manual_todo_recurrence_link_v1();

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

drop function if exists public.recurring_todo_has_follow_up_v1(uuid);

create or replace function public.recurring_todo_has_follow_up_v1(
  p_parent_todo_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  parent_row public.manual_todos%rowtype;
begin
  if actor_id is null or p_parent_todo_id is null then
    return false;
  end if;

  select *
  into parent_row
  from public.manual_todos
  where id = p_parent_todo_id;

  if not found or not public.can_access_manual_todo(parent_row.project_id, parent_row.user_id, actor_id) then
    return false;
  end if;

  return exists (
    select 1
    from public.manual_todos mt
    where mt.recurrence_source_todo_id = parent_row.id
  );
end;
$$;

drop function if exists public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid);
drop function if exists public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid, boolean);
drop function if exists public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid, boolean, timestamptz);

create or replace function public.complete_recurring_manual_todo_v1(
  p_todo_id uuid,
  p_fallback_date date default null,
  p_completed_at timestamptz default null,
  p_follow_up_id uuid default null,
  p_require_already_done boolean default false,
  p_expected_completed_at timestamptz default null
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
  follow_up_row public.manual_todos%rowtype;
  follow_up_exists_hidden boolean := false;
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

  if coalesce(p_require_already_done, false) then
    if existing.status is distinct from 'Done'
      or (p_expected_completed_at is not null and existing.completed_at is distinct from p_expected_completed_at) then
      raise exception using errcode = 'P0001', message = 'RECURRING_COMPLETION_STALE';
    end if;
    updated_row := existing;
  elsif existing.status is distinct from 'Done' then
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

    if follow_up_row.id is null then
      if public.recurring_todo_has_follow_up_v1(updated_row.id) then
        follow_up_exists_hidden := true;
      else
        target_follow_up_id := coalesce(p_follow_up_id, pg_catalog.gen_random_uuid());
        perform pg_catalog.set_config(
          'pmworkspace.recurring_todo_write',
          jsonb_build_object(
            'action', 'complete_recurring',
            'actor', actor_id::text,
            'parentId', updated_row.id::text,
            'followUpId', target_follow_up_id::text
          )::text,
          true
        );
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
          perform pg_catalog.set_config('pmworkspace.recurring_todo_write', '', true);
        exception
          when unique_violation then
            perform pg_catalog.set_config('pmworkspace.recurring_todo_write', '', true);
            select *
            into follow_up_row
            from public.manual_todos
            where recurrence_source_todo_id = updated_row.id
            limit 1;

            if follow_up_row.id is null then
              if public.recurring_todo_has_follow_up_v1(updated_row.id) then
                follow_up_exists_hidden := true;
              else
                raise;
              end if;
            end if;
          when others then
            perform pg_catalog.set_config('pmworkspace.recurring_todo_write', '', true);
            raise;
        end;
      end if;
    end if;

    if not follow_up_exists_hidden
      and (follow_up_row.id is null or follow_up_row.recurrence_source_todo_id is distinct from updated_row.id) then
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

revoke all on function public.recurring_todo_has_follow_up_v1(uuid) from public, anon, authenticated;
grant execute on function public.recurring_todo_has_follow_up_v1(uuid) to authenticated, service_role;

revoke all on function public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid, boolean, timestamptz) to authenticated, service_role;

revoke all on function public.recurring_todo_write_context_v1() from public, anon, authenticated;
grant execute on function public.recurring_todo_write_context_v1() to authenticated, service_role;

revoke all on function public.guard_manual_todo_recurrence_link_v1() from public, anon, authenticated;
grant execute on function public.guard_manual_todo_recurrence_link_v1() to service_role;

notify pgrst, 'reload schema';

commit;
