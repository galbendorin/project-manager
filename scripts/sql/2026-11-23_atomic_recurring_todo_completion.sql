-- Atomic recurring manual_todos completion and DB-enforced occurrence identity.
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

create or replace function public.complete_recurring_manual_todo_v1(
  p_todo_id uuid,
  p_next_due_date date default null,
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
  follow_up_row public.manual_todos%rowtype;
  recurrence_type text := '';
  is_recurring boolean := false;
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

  recurrence_type := case
    when jsonb_typeof(updated_row.recurrence) = 'string'
      then lower(btrim(updated_row.recurrence #>> '{}'))
    when jsonb_typeof(updated_row.recurrence) = 'object'
      then lower(btrim(coalesce(updated_row.recurrence->>'type', '')))
    else ''
  end;
  is_recurring := recurrence_type in ('weekday', 'weekdays', 'weekly', 'monthly', 'yearly', 'annual');

  if is_recurring then
    select *
    into follow_up_row
    from public.manual_todos
    where recurrence_source_todo_id = updated_row.id
    limit 1;

    if not found and p_follow_up_id is not null then
      select *
      into follow_up_row
      from public.manual_todos
      where id = p_follow_up_id
        and recurrence_source_todo_id is null
        and project_id is not distinct from updated_row.project_id
      limit 1;
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
          completed_at,
          recurrence_source_todo_id
        ) values (
          target_follow_up_id,
          actor_id,
          updated_row.project_id,
          coalesce(nullif(updated_row.title, ''), 'New Task'),
          coalesce(updated_row.description, ''),
          p_next_due_date,
          coalesce(nullif(updated_row.owner_text, ''), 'PM'),
          coalesce(updated_row.assignee_user_id, actor_id),
          'Open',
          updated_row.recurrence,
          updated_row.kanban_column_id,
          0,
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
             or (
               p_follow_up_id is not null
               and id = p_follow_up_id
               and project_id is not distinct from updated_row.project_id
             )
          limit 1;

          if follow_up_row.id is null then
            raise;
          end if;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'updated_todo', to_jsonb(updated_row),
    'follow_up_todo', case when follow_up_row.id is not null then to_jsonb(follow_up_row) else null end
  );
end;
$$;

revoke all on function public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid) to authenticated, service_role;

commit;
