-- Reject malformed saved details and prevent dangling legacy aliases on return. No data/grant changes.
begin;
do $$ begin
if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='promote_task_to_project_plan_v1' and md5(p.prosrc) in ('dc2efcf154e846007ee0aec373faf41c','1a1131c4ce6a952fb729ccabafa3cdde')) then raise exception 'PLAN_FUNCTION_CHANGED_REVIEW_REQUIRED'; end if;
if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='return_task_from_project_plan_v1' and md5(p.prosrc) in ('9cfe4c10391f0e9280db09e81e1b83bf','5e92da6e405a7b3d7e904f80110c6c4a')) then raise exception 'PLAN_FUNCTION_CHANGED_REVIEW_REQUIRED'; end if;
end; $$;
create or replace function public.promote_task_to_project_plan_v1(
  p_project_id uuid, p_source_kind text, p_source_id text, p_expected_version bigint,
  p_expected_source jsonb, p_operation_id uuid, p_intent jsonb
)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); project_row public.projects%rowtype; manual_row public.manual_todos%rowtype; source_row jsonb; link jsonb; source_key text; source_index integer; source_list jsonb; new_task jsonb; new_id bigint; duration integer; task_type text; dependency_choice text; dependencies jsonb; dependency jsonb; parent_row jsonb; parent_timing jsonb; parent_start date; parent_finish date; start_day date; candidate_day date; calculated_start date; finish_day date; normalized_intent jsonb; operation_ids jsonb; original_deadline text; old_project uuid; count_value integer; transfer_context jsonb; source_patch jsonb;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_project_id is null or p_operation_id is null or p_source_id is null or length(p_source_id) not between 1 and 1024 or p_source_kind is null or p_source_kind not in ('manual','action','tracker') or jsonb_typeof(p_intent)<>'object' or p_intent is null then raise exception using errcode='22023',message='PLAN_PROMOTION_INVALID'; end if;
  if p_source_kind='manual' then
    select * into manual_row from public.manual_todos where id=p_source_id::uuid for update;
    if not found then raise exception using errcode='42501',message='PLAN_SOURCE_UNAVAILABLE'; end if;
    source_row:=to_jsonb(manual_row); old_project:=manual_row.project_id;
    if jsonb_typeof(coalesce(manual_row.meta,'{}'::jsonb))<>'object' then raise exception using errcode='22023',message='PLAN_SOURCE_METADATA_INVALID'; end if;
    p_source_id:=manual_row.id::text;
    if old_project is not null and old_project<>p_project_id then raise exception using errcode='22023',message='PLAN_SOURCE_PROJECT_MISMATCH'; end if;
    source_key:='manual:'||manual_row.id::text;
  end if;
  select * into project_row from public.projects where id=p_project_id for update;
  if not found or not public.can_write_project(p_project_id,project_row.user_id,actor) then raise exception using errcode='42501',message='PROJECT_ACCESS_REQUIRED'; end if;
  if lower(btrim(project_row.name))='shopping list' then raise exception using errcode='22023',message='PLAN_PROJECT_INVALID'; end if;
  if p_source_kind<>'manual' then
    source_list:=case when p_source_kind='action' then coalesce(project_row.registers->'actions','[]') else coalesce(project_row.tracker,'[]') end;
    if (select count(*) from jsonb_array_elements(source_list) where value->>'_id'=p_source_id)<>1 then raise exception using errcode='22023',message='PLAN_SOURCE_ID_INVALID'; end if;
    select value,ordinality::integer-1 into source_row,source_index from jsonb_array_elements(source_list) with ordinality where value->>'_id'=p_source_id;
    if source_row is null then raise exception using errcode='42501',message='PLAN_SOURCE_UNAVAILABLE'; end if;
    source_key:='project:'||p_project_id::text||case when p_source_kind='action' then ':register:actions:' else ':tracker:' end||p_source_id;
  end if;
  link:=case when p_source_kind='manual' then source_row->'meta'->'projectPlanLink' else source_row->'projectPlanLink' end;
  if link is not null and link<>'null'::jsonb then
    if link->>'projectId'<>p_project_id::text then raise exception using errcode='22023',message='PLAN_SOURCE_PROJECT_MISMATCH'; end if;
    if link->>'operationId'=p_operation_id::text and link->'intent' is distinct from p_intent then raise exception using errcode='22023',message='PLAN_OPERATION_REPLAY_MISMATCH'; end if;
    select value into new_task from jsonb_array_elements(project_row.tasks) where (value->>'id')::numeric=(link->>'taskId')::numeric;
    if new_task is null or not public.task_plan_link_valid_v1(link,p_project_id,p_source_kind,p_source_id,new_task) then raise exception using errcode='22023',message='PLAN_LINK_UNAVAILABLE'; end if;
    return jsonb_build_object('ok',true,'existing',true,'operation_id',p_operation_id,'project_id',p_project_id,'source_key',source_key,'task_id',new_task->'id','task',new_task,'project',to_jsonb(project_row),'source',source_row);
  end if;
  operation_ids:=case when p_source_kind='manual' then coalesce(source_row->'meta'->'projectPlanOperationIds','[]') else coalesce(source_row->'projectPlanOperationIds','[]') end;
  if jsonb_typeof(operation_ids)<>'array' then raise exception using errcode='22023',message='PLAN_SOURCE_METADATA_INVALID'; end if;
  if operation_ids @> jsonb_build_array(p_operation_id::text) then raise exception using errcode='22023',message='PLAN_OPERATION_RETIRED'; end if;
  if project_row.version is distinct from p_expected_version or source_row is distinct from p_expected_source then raise exception using errcode='40001',message='PLAN_PROMOTION_CONFLICT'; end if;
  if p_source_kind='manual' then
    if manual_row.status='Done' or manual_row.recurrence is not null or manual_row.source_batch_id is not null or coalesce(manual_row.source_type,'')<>'' then raise exception using errcode='22023',message='PLAN_SOURCE_NOT_ELIGIBLE'; end if;
    original_deadline:=manual_row.due_date::text;
  else
    if lower(coalesce(source_row->>'status','')) in ('completed','done','cancelled','closed','resolved') or coalesce(source_row->>'completed','')<>'' then raise exception using errcode='22023',message='PLAN_SOURCE_NOT_ELIGIBLE'; end if;
    if (p_source_kind='action' and source_row->>'sourceTaskId' is not null) or (p_source_kind='tracker' and source_row->>'taskId' is not null) then raise exception using errcode='22023',message='PLAN_SOURCE_ALREADY_LINKED'; end if;
    original_deadline:=case when p_source_kind='action' then source_row->>'target' else source_row->>'dueDate' end;
  end if;
  perform public.task_plan_graph_v1(coalesce(project_row.tasks,'[]'));
  select coalesce(max((value->>'id')::numeric::bigint),0)+1 into new_id from jsonb_array_elements(coalesce(project_row.tasks,'[]'));
  task_type:=p_intent->>'type'; dependency_choice:=p_intent->>'dependency_choice';
  if task_type is null or task_type not in ('Task','Milestone') or jsonb_typeof(p_intent->'duration')<>'number' or p_intent->'duration' is null or (p_intent->>'duration')::numeric<>trunc((p_intent->>'duration')::numeric) then raise exception using errcode='22023',message='PLAN_DURATION_REQUIRED'; end if;
  duration:=(p_intent->>'duration')::integer;
  if duration not between 0 and 10000 or (task_type='Task' and duration=0) or (task_type='Milestone' and duration<>0) then raise exception using errcode='22023',message='PLAN_DURATION_INVALID'; end if;
  start_day:=public.task_plan_day_v1(p_intent->>'start');
  if start_day is null or dependency_choice is null or dependency_choice not in ('independent','dependent') or length(btrim(coalesce(p_intent->>'name',''))) not between 1 and 5000 then raise exception using errcode='22023',message='PLAN_SCHEDULING_REQUIRED'; end if;
  dependencies:=coalesce(p_intent->'dependencies','[]');
  if jsonb_typeof(dependencies)<>'array' or (dependency_choice='dependent' and jsonb_array_length(dependencies)=0) or (dependency_choice='independent' and jsonb_array_length(dependencies)<>0) then raise exception using errcode='22023',message='PLAN_DEPENDENCY_REQUIRED'; end if;
  for dependency in select value from jsonb_array_elements(dependencies) loop
    if coalesce(dependency->>'depType','') not in ('FS','SS','FF','SF') then raise exception using errcode='22023',message='PLAN_DEPENDENCY_INVALID'; end if;
    select value into parent_row from jsonb_array_elements(project_row.tasks) where (value->>'id')::numeric=(dependency->>'parentId')::numeric;
    if parent_row is null then raise exception using errcode='22023',message='PLAN_PREDECESSOR_NOT_FOUND'; end if;
    parent_timing:=public.task_plan_timing_v1(project_row.tasks,(parent_row->>'id')::numeric::bigint);
    parent_start:=public.task_plan_day_v1(parent_timing->>'start'); parent_finish:=public.task_plan_day_v1(parent_timing->>'finish');
    if parent_start is null or parent_finish is null then raise exception using errcode='22023',message='PLAN_PREDECESSOR_DATE_REQUIRED'; end if;
    candidate_day:=case dependency->>'depType' when 'FS' then parent_finish when 'SS' then parent_start when 'FF' then public.task_plan_business_day_v1(parent_finish,-duration) when 'SF' then public.task_plan_business_day_v1(parent_start,-duration) end;
    while extract(isodow from candidate_day)>5 loop candidate_day:=candidate_day+1; end loop;
    calculated_start:=case when calculated_start is null then candidate_day when p_intent->>'dependency_logic'='ANY' then least(calculated_start,candidate_day) else greatest(calculated_start,candidate_day) end;
  end loop;
  start_day:=coalesce(calculated_start,start_day); finish_day:=public.task_plan_business_day_v1(start_day,duration);
  if finish_day::text is distinct from p_intent->>'confirmed_finish' then raise exception using errcode='40001',message='PLAN_FINISH_CHANGED'; end if;
  normalized_intent:=p_intent;
  link:=jsonb_build_object('version',1,'projectId',p_project_id,'taskId',new_id,'sourceKind',p_source_kind,'sourceId',p_source_id,'sourceKey',source_key,'operationId',p_operation_id,'intent',normalized_intent,'originalDeadline',original_deadline,'originalProjectId',old_project);
  new_task:=jsonb_build_object('id',new_id,'name',btrim(p_intent->>'name'),'type',task_type,'start',start_day,'dur',duration,'pct',0,'indent',0,'tracked',true,'parent',null,'depType','FS','dependencies',dependencies,'depLogic',case when p_intent->>'dependency_logic'='ANY' then 'ANY' else 'ALL' end,'createdAt',now(),'updatedAt',now(),'originRef',link,'public',coalesce((source_row->>'public')::boolean,true));
  perform public.task_plan_graph_v1(coalesce(project_row.tasks,'[]')||jsonb_build_array(new_task));
  transfer_context:=jsonb_build_object('action','promote','actor',actor,'projectId',p_project_id,'sourceKind',p_source_kind,'sourceId',p_source_id,'taskId',new_id,'operationId',p_operation_id);
  perform set_config('pmworkspace.task_plan_write',transfer_context::text,true);
  update public.projects set tasks=coalesce(tasks,'[]')||jsonb_build_array(new_task), updated_at=now() where id=p_project_id and version=p_expected_version returning * into project_row;
  get diagnostics count_value=row_count;
  if count_value<>1 then raise exception using errcode='40001',message='PLAN_PROMOTION_CONFLICT'; end if;
  operation_ids:=operation_ids||jsonb_build_array(p_operation_id::text);
  if p_source_kind='manual' then
    update public.manual_todos set project_id=p_project_id,meta=coalesce(meta,'{}')||jsonb_build_object('projectPlanLink',link,'projectPlanOperationIds',operation_ids),updated_at=now() where id=manual_row.id returning to_jsonb(manual_todos.*) into source_row;
    if old_project is null then
      perform set_config('pmworkspace.task_plan_transfer',(transfer_context||jsonb_build_object('oldProjectId',old_project))::text,true);
      update public.task_card_checklists set project_id=p_project_id,updated_at=now() where project_id is null and user_id=actor and card_key=source_key;
      update public.task_card_checklist_items items set project_id=p_project_id,updated_at=now() where items.project_id is null and exists(select 1 from public.task_card_checklists checklist where checklist.id=items.checklist_id and checklist.project_id=p_project_id and checklist.user_id=actor and checklist.card_key=source_key);
      perform set_config('pmworkspace.task_plan_transfer','',true);
    end if;
  else
    source_patch:=jsonb_build_object('projectPlanLink',link,'projectPlanOperationIds',operation_ids,'updatedAt',now());
    source_patch:=source_patch||case when p_source_kind='action' then jsonb_build_object('sourceTaskId',new_id) else jsonb_build_object('taskId',new_id) end;
    source_row:=source_row||source_patch; source_list:=jsonb_set(source_list,array[source_index::text],source_row);
    if p_source_kind='action' then update public.projects set registers=jsonb_set(coalesce(registers,'{}'),array['actions'],source_list),updated_at=now() where id=p_project_id returning * into project_row;
    else update public.projects set tracker=source_list,updated_at=now() where id=p_project_id returning * into project_row; end if;
  end if;
  perform set_config('pmworkspace.task_plan_write','',true);
  return jsonb_build_object('ok',true,'existing',false,'operation_id',p_operation_id,'project_id',p_project_id,'source_key',source_key,'task_id',new_id,'task',new_task,'project',to_jsonb(project_row),'source',source_row);
end; $$;

create or replace function public.return_task_from_project_plan_v1(
  p_project_id uuid,p_source_kind text,p_source_id text,p_expected_version bigint,
  p_expected_source jsonb,p_expected_link jsonb,p_operation_id uuid
)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); project_row public.projects%rowtype; manual_row public.manual_todos%rowtype; source_row jsonb; link jsonb; receipt jsonb; source_list jsonb; source_index integer; plan_task jsonb; plan_index integer; next_tasks jsonb; next_source jsonb; timing jsonb; ids jsonb; context_value jsonb; status_value text; ancestor_index integer; ancestor_indent integer;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_project_id is null or p_operation_id is null or p_source_kind is null or p_source_kind not in ('manual','action','tracker') or coalesce(p_source_id,'')='' then raise exception using errcode='22023',message='PLAN_RETURN_INVALID'; end if;
  if p_source_kind='manual' then
    select * into manual_row from public.manual_todos where id=p_source_id::uuid for update;
    if not found or manual_row.project_id is distinct from p_project_id then raise exception using errcode='42501',message='PLAN_SOURCE_UNAVAILABLE'; end if;
    p_source_id:=manual_row.id::text; source_row:=to_jsonb(manual_row);
  end if;
  select * into project_row from public.projects where id=p_project_id for update;
  if not found or not public.can_write_project(p_project_id,project_row.user_id,actor) then raise exception using errcode='42501',message='PROJECT_ACCESS_REQUIRED'; end if;
  if p_source_kind<>'manual' then
    source_list:=case when p_source_kind='action' then coalesce(project_row.registers->'actions','[]') else coalesce(project_row.tracker,'[]') end;
    if (select count(*) from jsonb_array_elements(source_list) where value->>'_id'=p_source_id)<>1 then raise exception using errcode='22023',message='PLAN_SOURCE_ID_INVALID'; end if;
    select value,ordinality::integer-1 into source_row,source_index from jsonb_array_elements(source_list) with ordinality where value->>'_id'=p_source_id;
    if source_row is null then raise exception using errcode='42501',message='PLAN_SOURCE_UNAVAILABLE'; end if;
  end if;
  link:=case when p_source_kind='manual' then source_row->'meta'->'projectPlanLink' else source_row->'projectPlanLink' end;
  receipt:=case when p_source_kind='manual' then source_row->'meta'->'projectPlanLastReturn' else source_row->'projectPlanLastReturn' end;
  ids:=case when p_source_kind='manual' then coalesce(source_row->'meta'->'projectPlanOperationIds','[]') else coalesce(source_row->'projectPlanOperationIds','[]') end;
  if jsonb_typeof(ids)<>'array' then raise exception using errcode='22023',message='PLAN_SOURCE_METADATA_INVALID'; end if;
  if link is null or link='null'::jsonb then
    if receipt->>'operationId'=p_operation_id::text and receipt->'link'=p_expected_link then
      return jsonb_build_object('ok',true,'existing',true,'operation_id',p_operation_id,'project_id',p_project_id,'task_id',receipt->'link'->'taskId','project',to_jsonb(project_row),'source',source_row);
    end if;
    raise exception using errcode='22023',message='PLAN_RETURN_LINK_UNAVAILABLE';
  end if;
  if ids @> jsonb_build_array(p_operation_id::text) then raise exception using errcode='22023',message='PLAN_OPERATION_RETIRED'; end if;
  if project_row.version is distinct from p_expected_version or source_row is distinct from p_expected_source or link is distinct from p_expected_link then raise exception using errcode='40001',message='PLAN_RETURN_CONFLICT'; end if;
  select value,ordinality::integer-1 into plan_task,plan_index from jsonb_array_elements(project_row.tasks) with ordinality where value->'id'=link->'taskId';
  if plan_task is null or not public.task_plan_link_valid_v1(link,p_project_id,p_source_kind,p_source_id,plan_task) then raise exception using errcode='22023',message='PLAN_LINK_UNAVAILABLE'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(project_row.tracker,'[]')) item where case when item->>'taskId' ~ '^\d+(\.0+)?$' then (item->>'taskId')::numeric else null end=(link->>'taskId')::numeric and not(p_source_kind='tracker' and item->>'_id' is not distinct from p_source_id))
    or exists(select 1 from jsonb_array_elements(coalesce(project_row.registers->'actions','[]')) item where (case when item->>'sourceTaskId' ~ '^\d+(\.0+)?$' then (item->>'sourceTaskId')::numeric else null end=(link->>'taskId')::numeric or item->>'_id'='track_'||(link->>'taskId')) and not(p_source_kind='action' and item->>'_id' is not distinct from p_source_id)) then raise exception using errcode='22023',message='PLAN_RETURN_ALIAS_EXISTS'; end if;
  if exists(select 1 from jsonb_array_elements(project_row.tasks) task cross join lateral jsonb_array_elements(public.task_plan_dependencies_v1(task)) dependency where task->'id'<>link->'taskId' and (dependency->>'parentId')::numeric=(link->>'taskId')::numeric)
    or (plan_index+1<jsonb_array_length(project_row.tasks) and coalesce((project_row.tasks->(plan_index+1)->>'indent')::integer,0)>coalesce((plan_task->>'indent')::integer,0)) then raise exception using errcode='22023',message='PLAN_RETURN_DEPENDENTS_EXIST'; end if;
  -- Removing a child can change its summary ancestors' finish. Do not leave
  -- a successor of one of those groups on a stale schedule.
  ancestor_indent:=coalesce((plan_task->>'indent')::integer,0);
  if ancestor_indent>0 then
    for ancestor_index in reverse plan_index-1..0 loop
      if coalesce((project_row.tasks->ancestor_index->>'indent')::integer,0)<ancestor_indent then
        if exists(select 1 from jsonb_array_elements(project_row.tasks) task cross join lateral jsonb_array_elements(public.task_plan_dependencies_v1(task)) dependency where task->'id'<>link->'taskId' and (dependency->>'parentId')::numeric=(project_row.tasks->ancestor_index->>'id')::numeric) then raise exception using errcode='22023',message='PLAN_RETURN_DEPENDENTS_EXIST'; end if;
        ancestor_indent:=coalesce((project_row.tasks->ancestor_index->>'indent')::integer,0);
        exit when ancestor_indent=0;
      end if;
    end loop;
  end if;
  perform public.task_plan_graph_v1(project_row.tasks);
  timing:=public.task_plan_timing_v1(project_row.tasks,(link->>'taskId')::bigint);
  if timing->>'finish' is null then raise exception using errcode='22023',message='PLAN_RETURN_DATE_REQUIRED'; end if;
  status_value:=case when coalesce((plan_task->>'pct')::numeric,0)>=100 then 'Completed' else 'Open' end;
  receipt:=jsonb_build_object('operationId',p_operation_id,'link',link);
  ids:=ids||jsonb_build_array(p_operation_id::text);
  context_value:=jsonb_build_object('action','return','actor',actor,'projectId',p_project_id,'sourceKind',p_source_kind,'sourceId',p_source_id,'taskId',link->'taskId','operationId',p_operation_id);
  perform set_config('pmworkspace.task_plan_write',context_value::text,true);
  next_tasks:=project_row.tasks-plan_index;
  if p_source_kind='manual' then
    update public.manual_todos set title=plan_task->>'name',due_date=(timing->>'finish')::date,status=case when status_value='Completed' then 'Done' else 'Open' end,completed_at=case when status_value='Completed' then coalesce(completed_at,now()) else null end,
      meta=(coalesce(meta,'{}')-'projectPlanLink')||jsonb_build_object('projectPlanOperationIds',ids,'projectPlanLastLink',link,'projectPlanLastReturn',receipt),updated_at=now()
      where id=manual_row.id returning to_jsonb(manual_todos.*) into source_row;
    update public.projects set tasks=next_tasks,updated_at=now() where id=p_project_id returning * into project_row;
  else
    next_source:=(source_row-'projectPlanLink')||jsonb_build_object('projectPlanOperationIds',ids,'projectPlanLastLink',link,'projectPlanLastReturn',receipt,'updatedAt',now());
    if p_source_kind='action' then
      next_source:=(next_source-'sourceTaskId')||jsonb_build_object('description',plan_task->>'name','target',timing->>'finish','status',status_value,'completed',case when status_value='Completed' then current_date::text else '' end);
      source_list:=jsonb_set(source_list,array[source_index::text],next_source);
      update public.projects set tasks=next_tasks,registers=jsonb_set(coalesce(registers,'{}'),array['actions'],source_list),updated_at=now() where id=p_project_id returning * into project_row;
    else
      next_source:=(next_source-'taskId')||jsonb_build_object('taskName',plan_task->>'name','dueDate',timing->>'finish','status',case when status_value='Completed' then 'Completed' when coalesce((plan_task->>'pct')::numeric,0)>0 then 'In Progress' else 'Not Started' end,'pctCompleted',coalesce(plan_task->'pct','0'::jsonb));
      source_list:=jsonb_set(source_list,array[source_index::text],next_source);
      update public.projects set tasks=next_tasks,tracker=source_list,updated_at=now() where id=p_project_id returning * into project_row;
    end if;
    source_row:=next_source;
  end if;
  perform set_config('pmworkspace.task_plan_write','',true);
  return jsonb_build_object('ok',true,'existing',false,'operation_id',p_operation_id,'project_id',p_project_id,'task_id',link->'taskId','project',to_jsonb(project_row),'source',source_row);
end; $$;
notify pgrst,'reload schema';
commit;
