-- Keep an ordinary task and its existing checklist IDs in the same project.
-- Trigger-only helpers: no browser-callable privileged RPC or RLS changes.
begin;

create or replace function public.move_manual_task_checklists_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare checklist_ids uuid[];
begin
  if new.project_id is not distinct from old.project_id then return new; end if;
  -- Lock parents before moving children. Child writes lock the same parents.
  select array_agg(locked.id) into checklist_ids from (
    select c.id from public.task_card_checklists c
    where c.card_key = 'manual:' || new.id::text
      and c.project_id is not distinct from old.project_id
      and (old.project_id is not null or c.user_id = old.user_id)
    order by c.id for update
  ) locked;
  if checklist_ids is null then return new; end if;
  if new.project_id is null and exists (
    select 1 from public.task_card_checklists c
    where c.id = any(checklist_ids) and c.user_id <> new.user_id
  ) then
    raise exception using errcode = '23514', message = 'TASK_PROJECT_PERSONAL_CHECKLIST_OWNERSHIP';
  end if;
  if exists (
    select 1 from public.task_card_checklist_items i
    where i.checklist_id = any(checklist_ids)
      and i.project_id is distinct from old.project_id
  ) then
    raise exception using errcode = '23514', message = 'TASK_PROJECT_CHECKLIST_SCOPE_MISMATCH';
  end if;
  update public.task_card_checklists set project_id = new.project_id, updated_at = now()
    where id = any(checklist_ids);
  update public.task_card_checklist_items set project_id = new.project_id, updated_at = now()
    where checklist_id = any(checklist_ids);
  return new;
end;
$$;

create or replace function public.guard_checklist_item_project_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare parent_project uuid;
begin
  -- FOR KEY SHARE waits for the task move's FOR UPDATE, then checks the current
  -- parent version, so a concurrent old-project insert cannot become orphaned.
  select c.project_id into parent_project from public.task_card_checklists c
    where c.id = new.checklist_id for key share;
  if not found or parent_project is distinct from new.project_id then
    raise exception using errcode = '23514', message = 'TASK_PROJECT_CHECKLIST_SCOPE_MISMATCH';
  end if;
  return new;
end;
$$;

create or replace function public.guard_manual_checklist_project_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare source_row public.manual_todos%rowtype; actor uuid := auth.uid();
begin
  -- Derived and legacy local card keys retain their existing behavior.
  if new.card_key !~ '^manual:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return new; end if;
  -- SHARE conflicts with an ordinary task UPDATE's NO KEY UPDATE lock.
  select * into source_row from public.manual_todos
    where id = substring(new.card_key from 8)::uuid for share;
  if not found then
    raise exception using errcode = '23514', message = 'TASK_PROJECT_SOURCE_UNAVAILABLE';
  end if;
  if (actor is not null and not public.can_access_manual_todo(source_row.project_id, source_row.user_id, actor))
    or (actor is null and current_setting('role') in ('anon','authenticated')) then
    raise exception using errcode = '42501', message = 'TASK_PROJECT_ACCESS_REQUIRED';
  end if;
  if source_row.project_id is distinct from new.project_id then
    raise exception using errcode = '23514', message = 'TASK_PROJECT_CHECKLIST_SCOPE_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function public.move_manual_task_checklists_v1(),
  public.guard_checklist_item_project_v1(), public.guard_manual_checklist_project_v1()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_manual_task_checklist_project_v1 on public.manual_todos;
create trigger trg_manual_task_checklist_project_v1
  after update of project_id on public.manual_todos
  for each row execute function public.move_manual_task_checklists_v1();
drop trigger if exists trg_checklist_item_project_v1 on public.task_card_checklist_items;
create trigger trg_checklist_item_project_v1
  before insert or update of checklist_id, project_id on public.task_card_checklist_items
  for each row execute function public.guard_checklist_item_project_v1();
drop trigger if exists trg_manual_checklist_project_v1 on public.task_card_checklists;
create trigger trg_manual_checklist_project_v1
  before insert or update of card_key, project_id on public.task_card_checklists
  for each row execute function public.guard_manual_checklist_project_v1();
notify pgrst, 'reload schema';
commit;
