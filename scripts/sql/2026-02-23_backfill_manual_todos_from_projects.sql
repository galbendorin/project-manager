-- Step 8 migration: safely backfill legacy projects.todos into public.manual_todos.
-- Idempotent behavior:
-- - No-op if manual_todos table does not exist.
-- - No-op if projects.todos column does not exist.
-- - Uses deterministic created_at offsets by legacy array order to avoid duplicate inserts on rerun.

do $$
declare
  has_manual_todos_table boolean;
  has_projects_todos_column boolean;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'manual_todos'
  ) into has_manual_todos_table;

  if not has_manual_todos_table then
    raise notice 'Skipping backfill: public.manual_todos does not exist.';
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'todos'
  ) into has_projects_todos_column;

  if not has_projects_todos_column then
    raise notice 'Skipping backfill: public.projects.todos does not exist.';
    return;
  end if;

  execute $sql$
    with legacy_rows as (
      select
        p.user_id,
        case
          when todo_item.todo ? 'projectId' then
            case
              when coalesce(nullif(btrim(todo_item.todo->>'projectId'), ''), '') = '' then null
              when (todo_item.todo->>'projectId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (todo_item.todo->>'projectId')::uuid
              else p.id
            end
          else p.id
        end as project_id,
        coalesce(nullif(btrim(todo_item.todo->>'title'), ''), 'Untitled') as title,
        case
          when coalesce(todo_item.todo->>'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then (todo_item.todo->>'dueDate')::date
          else null
        end as due_date,
        coalesce(nullif(btrim(todo_item.todo->>'owner'), ''), '') as owner_text,
        case
          when lower(coalesce(todo_item.todo->>'status', '')) in ('done', 'complete', 'completed', 'closed', 'resolved') then 'Done'
          else 'Open'
        end as status,
        case
          when jsonb_typeof(todo_item.todo->'recurrence') = 'object' then todo_item.todo->'recurrence'
          else null
        end as recurrence,
        (
          coalesce(p.updated_at, timezone('utc', now()))
          + ((todo_item.ord::int - 1) * interval '1 millisecond')
        ) as created_at,
        (
          coalesce(p.updated_at, timezone('utc', now()))
          + ((todo_item.ord::int - 1) * interval '1 millisecond')
        ) as updated_at
      from public.projects p
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(p.todos) = 'array' then p.todos
          else '[]'::jsonb
        end
      ) with ordinality as todo_item(todo, ord)
      where p.user_id is not null
    )
    insert into public.manual_todos (
      user_id,
      project_id,
      title,
      due_date,
      owner_text,
      status,
      recurrence,
      completed_at,
      created_at,
      updated_at
    )
    select
      lr.user_id,
      lr.project_id,
      lr.title,
      lr.due_date,
      lr.owner_text,
      lr.status,
      lr.recurrence,
      case when lr.status = 'Done' then lr.updated_at else null end as completed_at,
      lr.created_at,
      lr.updated_at
    from legacy_rows lr
    where not exists (
      select 1
      from public.manual_todos mt
      where mt.user_id = lr.user_id
        and coalesce(mt.project_id::text, '') = coalesce(lr.project_id::text, '')
        and mt.title = lr.title
        and coalesce(mt.due_date::text, '') = coalesce(lr.due_date::text, '')
        and coalesce(mt.owner_text, '') = coalesce(lr.owner_text, '')
        and mt.status = lr.status
        and coalesce(mt.recurrence, 'null'::jsonb) = coalesce(lr.recurrence, 'null'::jsonb)
        and mt.created_at = lr.created_at
    );
  $sql$;

  raise notice 'Backfill complete (legacy projects.todos -> manual_todos).';
end $$;
