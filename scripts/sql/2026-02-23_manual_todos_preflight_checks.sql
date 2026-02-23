-- Preflight checks for manual_todos rollout.
-- Run this in Supabase SQL Editor after:
-- 1) 2026-02-23_create_manual_todos.sql
-- 2) 2026-02-23_backfill_manual_todos_from_projects.sql (if legacy data existed)
-- 3) 2026-02-23_drop_legacy_projects_todos.sql
--
-- Output:
-- - Detailed pass/fail rows per check
-- - Overall PASS/FAIL summary row

create temporary table if not exists tmp_manual_todos_preflight_results (
  check_name text not null,
  pass boolean not null,
  detail text not null
) on commit drop;

truncate table tmp_manual_todos_preflight_results;

do $$
declare
  has_manual_todos_table boolean := false;
  has_projects_todos_column boolean := false;
  missing_columns text;
  rls_enabled boolean := false;
  policy_count integer := 0;
  manual_todos_count bigint := 0;
  invalid_status_count bigint := 0;
  done_missing_completed_at_count bigint := 0;
  invalid_recurrence_type_count bigint := 0;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'manual_todos'
  ) into has_manual_todos_table;

  insert into tmp_manual_todos_preflight_results(check_name, pass, detail)
  values (
    'manual_todos_table_exists',
    has_manual_todos_table,
    case
      when has_manual_todos_table then 'public.manual_todos exists'
      else 'public.manual_todos is missing'
    end
  );

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'todos'
  ) into has_projects_todos_column;

  insert into tmp_manual_todos_preflight_results(check_name, pass, detail)
  values (
    'projects_todos_column_removed',
    not has_projects_todos_column,
    case
      when has_projects_todos_column then 'public.projects.todos still exists'
      else 'public.projects.todos is removed'
    end
  );

  if not has_manual_todos_table then
    return;
  end if;

  select string_agg(req.column_name, ', ' order by req.column_name)
  into missing_columns
  from (
    values
      ('id'),
      ('user_id'),
      ('project_id'),
      ('title'),
      ('due_date'),
      ('owner_text'),
      ('assignee_user_id'),
      ('status'),
      ('recurrence'),
      ('completed_at'),
      ('created_at'),
      ('updated_at')
  ) as req(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'manual_todos'
   and c.column_name = req.column_name
  where c.column_name is null;

  insert into tmp_manual_todos_preflight_results(check_name, pass, detail)
  values (
    'manual_todos_required_columns_present',
    missing_columns is null,
    case
      when missing_columns is null then 'All required columns are present'
      else 'Missing columns: ' || missing_columns
    end
  );

  select c.relrowsecurity
  into rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'manual_todos';

  insert into tmp_manual_todos_preflight_results(check_name, pass, detail)
  values (
    'manual_todos_rls_enabled',
    coalesce(rls_enabled, false),
    case
      when coalesce(rls_enabled, false) then 'RLS is enabled'
      else 'RLS is disabled'
    end
  );

  select count(*)
  into policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'manual_todos'
    and policyname in (
      'manual_todos_select_own',
      'manual_todos_insert_own',
      'manual_todos_update_own',
      'manual_todos_delete_own'
    );

  insert into tmp_manual_todos_preflight_results(check_name, pass, detail)
  values (
    'manual_todos_rls_policies_present',
    policy_count = 4,
    'Found ' || policy_count::text || ' of 4 expected policies'
  );

  execute 'select count(*) from public.manual_todos'
  into manual_todos_count;

  insert into tmp_manual_todos_preflight_results(check_name, pass, detail)
  values (
    'manual_todos_row_count',
    true,
    manual_todos_count::text || ' rows in public.manual_todos'
  );

  execute $q$
    select count(*)
    from public.manual_todos
    where status not in ('Open', 'Done')
  $q$
  into invalid_status_count;

  insert into tmp_manual_todos_preflight_results(check_name, pass, detail)
  values (
    'manual_todos_status_values_valid',
    invalid_status_count = 0,
    invalid_status_count::text || ' rows with invalid status'
  );

  execute $q$
    select count(*)
    from public.manual_todos
    where status = 'Done'
      and completed_at is null
  $q$
  into done_missing_completed_at_count;

  insert into tmp_manual_todos_preflight_results(check_name, pass, detail)
  values (
    'manual_todos_done_has_completed_at',
    done_missing_completed_at_count = 0,
    done_missing_completed_at_count::text || ' Done rows missing completed_at'
  );

  execute $q$
    select count(*)
    from public.manual_todos
    where recurrence is not null
      and (
        jsonb_typeof(recurrence) <> 'object'
        or lower(coalesce(recurrence->>'type', '')) not in ('weekdays', 'weekly', 'monthly', 'yearly')
      )
  $q$
  into invalid_recurrence_type_count;

  insert into tmp_manual_todos_preflight_results(check_name, pass, detail)
  values (
    'manual_todos_recurrence_types_valid',
    invalid_recurrence_type_count = 0,
    invalid_recurrence_type_count::text || ' rows with invalid recurrence.type'
  );
end $$;

select
  check_name,
  pass,
  detail
from tmp_manual_todos_preflight_results
order by pass asc, check_name asc;

select
  case
    when bool_and(pass) then 'PASS'
    else 'FAIL'
  end as overall_status,
  count(*) filter (where not pass) as failed_checks,
  count(*) as total_checks
from tmp_manual_todos_preflight_results;
