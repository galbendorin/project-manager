begin read only;
select 'table' as kind, c.relname as object_name,
  jsonb_build_object('rls',c.relrowsecurity,'anon_select',has_table_privilege('anon',c.oid,'SELECT'),
  'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
  'authenticated_insert',has_table_privilege('authenticated',c.oid,'INSERT'),
  'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'),
  'authenticated_delete',has_table_privilege('authenticated',c.oid,'DELETE')) as detail
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='baby_sleep_entries'
union all
select 'constraint',conname,jsonb_build_object('validated',convalidated,'definition',pg_get_constraintdef(oid))
from pg_constraint where conrelid='public.baby_sleep_entries'::regclass
union all
select 'policy',policyname,jsonb_build_object('using',qual,'check',with_check)
from pg_policies where schemaname='public' and tablename='baby_sleep_entries'
union all
select 'trigger',tgname,jsonb_build_object('state',tgenabled,'definition',pg_get_triggerdef(oid))
from pg_trigger where tgrelid='public.baby_sleep_entries'::regclass and not tgisinternal;
commit;
