-- Read-only: confirms the additive Calendar migration, without displaying tasks.
select 'column' as kind, column_name as object_name, jsonb_build_object('type', data_type, 'nullable', is_nullable) as detail
from information_schema.columns where table_schema = 'public' and table_name = 'task_eisenhower_preferences'
and column_name in ('planned_start_minute', 'planned_duration_minutes')
union all
select 'constraint', conname, jsonb_build_object('validated', convalidated, 'definition', pg_get_constraintdef(oid))
from pg_constraint where conrelid = 'public.task_eisenhower_preferences'::regclass and conname = 'task_calendar_slot_check'
union all
select 'trigger', tgname, jsonb_build_object('state', tgenabled, 'definition', pg_get_triggerdef(oid))
from pg_trigger where tgrelid = 'public.task_eisenhower_preferences'::regclass and tgname = 'trg_task_calendar_normalize'
union all
select 'function', proname, jsonb_build_object('security_definer', prosecdef,
  'anon_execute', has_function_privilege('anon', oid, 'EXECUTE'), 'authenticated_execute', has_function_privilege('authenticated', oid, 'EXECUTE'))
from pg_proc where oid = 'public.normalize_task_calendar_slot()'::regprocedure;
