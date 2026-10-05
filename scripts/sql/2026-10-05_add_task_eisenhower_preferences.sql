-- Additive: install before the Matrix client. Existing task data is untouched.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table public.task_eisenhower_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  manual_todo_id uuid references public.manual_todos(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  card_key text,
  task_key text not null,
  manual_quadrant text not null check(manual_quadrant in
    ('urgent_important','not_urgent_important','urgent_not_important','not_urgent_not_important')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,task_key),
  check((manual_todo_id is not null and project_id is null and card_key is null)
    or (manual_todo_id is null and project_id is not null and card_key is not null
      and card_key ~ '^(register:(actions|issues|changes):|tracker:|schedule:).+' and length(card_key)<=1024))
);
create function public.stamp_task_eisenhower_preference() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if (new.user_id,new.manual_todo_id,new.project_id,new.card_key)
      is distinct from (old.user_id,old.manual_todo_id,old.project_id,old.card_key) then
      raise exception using errcode='22023',message='MATRIX_IDENTITY_IMMUTABLE';
    end if;
    new.version:=old.version+1;
    new.created_at:=old.created_at;
  else
    new.version:=1;
    new.created_at:=now();
  end if;
  new.task_key:=case when new.manual_todo_id is not null then 'manual:'||new.manual_todo_id::text
    else 'project:'||new.project_id::text||':'||new.card_key end;
  new.updated_at:=now();
  return new;
end $$;
revoke all on function public.stamp_task_eisenhower_preference() from public,anon,authenticated;
create trigger trg_task_eisenhower_stamp before insert or update on public.task_eisenhower_preferences
for each row execute function public.stamp_task_eisenhower_preference();
alter table public.task_eisenhower_preferences enable row level security;
create policy matrix_preferences_access on public.task_eisenhower_preferences for all to authenticated
using(user_id=auth.uid() and (
  (manual_todo_id is not null and exists(select 1 from public.manual_todos t where t.id=manual_todo_id))
  or (project_id is not null and public.can_access_project(project_id,auth.uid()))))
with check(user_id=auth.uid() and (
  (manual_todo_id is not null and exists(select 1 from public.manual_todos t where t.id=manual_todo_id))
  or (project_id is not null and public.can_access_project(project_id,auth.uid()))));
revoke all on public.task_eisenhower_preferences from public,anon;
grant select,insert,update,delete on public.task_eisenhower_preferences to authenticated;
grant all on public.task_eisenhower_preferences to service_role;
notify pgrst,'reload schema';
commit;
