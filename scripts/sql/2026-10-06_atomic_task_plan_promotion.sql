-- Atomic, authenticated promotion. Existing source IDs and data are retained.
-- Install only after the isolated contract tests and source review pass.
begin;

-- Never replace an unexpectedly modified checklist permission helper.
do $$
declare existing text;
begin
  select prosrc into existing from pg_proc where oid=to_regprocedure('public.can_access_task_card_checklist_item(uuid,uuid,uuid)');
  if existing is null or (md5(regexp_replace(existing,'\s+','','g'))<>'a0335cbaeb4430ab98ffb3401febbde4' and md5(existing)<>'14eacbc70afad1ed027dfb806a84c988') then raise exception 'PLAN_CHECKLIST_HELPER_CHANGED_REVIEW_REQUIRED'; end if;
end; $$;

create or replace function public.task_plan_day_v1(value text)
returns date language plpgsql immutable security invoker set search_path='' as $$
declare parts text[]; year_value integer; month_value integer;
begin
  if value ~ '^\d{4}-\d{2}-\d{2}$' then return value::date; end if;
  parts := regexp_match(value, '^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$');
  if parts is null then return null; end if;
  year_value := case when length(parts[3])=2 then 2000+parts[3]::integer else parts[3]::integer end;
  month_value := array_position(array['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],lower(parts[2]));
  return make_date(year_value,month_value,parts[1]::integer);
exception when datetime_field_overflow or invalid_datetime_format or invalid_text_representation then return null;
end; $$;

create or replace function public.task_plan_business_day_v1(start_day date, duration integer)
returns date language plpgsql immutable security invoker set search_path='' as $$
declare next_day date:=start_day; remaining integer:=abs(duration); direction integer:=case when duration<0 then -1 else 1 end;
begin
  if start_day is null or duration is null or remaining>10000 then return null; end if;
  while remaining>0 loop
    next_day:=next_day+direction;
    if extract(isodow from next_day)<=5 then remaining:=remaining-1; end if;
  end loop;
  return next_day;
end; $$;

create or replace function public.task_plan_dependencies_v1(task jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select case when jsonb_typeof(task->'dependencies')='array' and jsonb_array_length(task->'dependencies')>0
    then task->'dependencies'
    when coalesce(task->>'parent','') not in ('','0') then jsonb_build_array(jsonb_build_object('parentId',task->'parent','depType',coalesce(task->>'depType','FS')))
    else '[]'::jsonb end
$$;

create or replace function public.task_plan_graph_v1(tasks jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare task jsonb; dep jsonb; child jsonb; node text; parent_node text; ids jsonb:='{}'; edges jsonb:='{}'; states jsonb:='{}'; stack jsonb:='[]'; frame jsonb; index_value integer; parent_index integer; child_index integer; successor_index integer; count_value integer; indent_value integer; child_ids jsonb; successor_inside boolean; seen_dependencies jsonb;
begin
  if jsonb_typeof(tasks)<>'array' or tasks is null or jsonb_array_length(tasks)>5000 then raise exception using errcode='22023',message='PLAN_GRAPH_INVALID'; end if;
  count_value:=jsonb_array_length(tasks);
  for task in select value from jsonb_array_elements(tasks) loop
    if jsonb_typeof(task->'id')<>'number' or task->'id' is null or (task->>'id')::numeric<>trunc((task->>'id')::numeric) or (task->>'id')::numeric<=0 or (task->>'id')::numeric>9007199254740990 then raise exception using errcode='22023',message='PLAN_TASK_ID_INVALID'; end if;
    node:=((task->>'id')::numeric::bigint)::text;
    if ids ? node then raise exception using errcode='22023',message='PLAN_TASK_ID_DUPLICATE'; end if;
    ids:=ids||jsonb_build_object(node,true); edges:=edges||jsonb_build_object(node,'[]'::jsonb);
  end loop;
  for successor_index in 0..count_value-1 loop
    task:=tasks->successor_index; node:=((task->>'id')::numeric::bigint)::text; seen_dependencies:='{}';
    for dep in select value from jsonb_array_elements(public.task_plan_dependencies_v1(task)) loop
      parent_node:=((dep->>'parentId')::numeric::bigint)::text;
      if not ids ? parent_node then raise exception using errcode='22023',message='PLAN_PREDECESSOR_NOT_FOUND'; end if;
      if parent_node=node or seen_dependencies ? parent_node then raise exception using errcode='22023',message='PLAN_DEPENDENCY_INVALID'; end if;
      seen_dependencies:=seen_dependencies||jsonb_build_object(parent_node,true);
      edges:=jsonb_set(edges,array[node],edges->node||jsonb_build_array(parent_node));
      select ordinality::integer-1 into parent_index from jsonb_array_elements(tasks) with ordinality where ((value->>'id')::numeric::bigint)::text=parent_node;
      indent_value:=coalesce((tasks->parent_index->>'indent')::integer,0); child_ids:='[]'; successor_inside:=false;
      child_index:=parent_index+1;
      while child_index<count_value and coalesce((tasks->child_index->>'indent')::integer,0)>indent_value loop
        child:=tasks->child_index; child_ids:=child_ids||jsonb_build_array(((child->>'id')::numeric::bigint)::text);
        if child_index=successor_index then successor_inside:=true; end if;
        child_index:=child_index+1;
      end loop;
      if not successor_inside then edges:=jsonb_set(edges,array[node],edges->node||child_ids); end if;
    end loop;
  end loop;
  for node in select key from jsonb_object_keys(ids) key loop stack:=stack||jsonb_build_array(jsonb_build_object('node',node,'exit',false)); end loop;
  while jsonb_array_length(stack)>0 loop
    index_value:=jsonb_array_length(stack)-1; frame:=stack->index_value; stack:=stack-index_value; node:=frame->>'node';
    if (frame->>'exit')::boolean then states:=states||jsonb_build_object(node,2); continue; end if;
    if states->>node='2' then continue; end if;
    if states->>node='1' then raise exception using errcode='22023',message='PLAN_DEPENDENCY_CYCLE'; end if;
    states:=states||jsonb_build_object(node,1); stack:=stack||jsonb_build_array(jsonb_build_object('node',node,'exit',true));
    for parent_node in select value from jsonb_array_elements_text(edges->node) loop stack:=stack||jsonb_build_array(jsonb_build_object('node',parent_node,'exit',false)); end loop;
  end loop;
end; $$;

create or replace function public.task_plan_timing_v1(tasks jsonb, task_id bigint)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare timings jsonb:='{}'; task jsonb; child jsonb; timing jsonb; start_day date; finish_day date; calendar_finish date; earliest date; latest date; duration integer; indent_value integer; child_index integer; index_value integer; count_value integer; day_value date; key_value text;
begin
  count_value:=jsonb_array_length(tasks);
  for index_value in reverse count_value-1..0 loop
    task:=tasks->index_value; start_day:=public.task_plan_day_v1(task->>'start'); duration:=coalesce((task->>'dur')::integer,0); finish_day:=public.task_plan_business_day_v1(start_day,duration);
    calendar_finish:=finish_day; earliest:=null; latest:=null; indent_value:=coalesce((task->>'indent')::integer,0); child_index:=index_value+1;
    while child_index<count_value and coalesce((tasks->child_index->>'indent')::integer,0)>indent_value loop
      child:=tasks->child_index; timing:=timings->(((child->>'id')::numeric::bigint)::text);
      if timing->>'start' is not null and timing->>'finish' is not null then
        earliest:=case when earliest is null then (timing->>'start')::date else least(earliest,(timing->>'start')::date) end;
        latest:=case when latest is null then (timing->>'calendarFinish')::date else greatest(latest,(timing->>'calendarFinish')::date) end;
      end if;
      child_index:=child_index+1;
    end loop;
    if earliest is not null and latest is not null then
      start_day:=earliest; duration:=0; day_value:=earliest;
      while day_value<latest loop day_value:=day_value+1; if extract(isodow from day_value)<=5 then duration:=duration+1; end if; end loop;
      -- Match calculateSchedule: a summary's predecessor end is its earliest
      -- start plus the counted business-day duration, even for weekend milestones.
      finish_day:=public.task_plan_business_day_v1(start_day,duration);
      calendar_finish:=latest;
    end if;
    key_value:=((task->>'id')::numeric::bigint)::text;
    timings:=timings||jsonb_build_object(key_value,jsonb_build_object('start',start_day,'finish',finish_day,'calendarFinish',calendar_finish,'duration',duration));
  end loop;
  return timings->task_id::text;
end; $$;

create or replace function public.task_plan_link_valid_v1(link jsonb,project_id uuid,source_kind text,source_id text,task jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare source_key text;
begin
  if source_kind='manual' then source_key:='manual:'||source_id::uuid::text;
  elsif source_kind in ('action','tracker') then source_key:='project:'||project_id::text||case when source_kind='action' then ':register:actions:' else ':tracker:' end||source_id;
  else return false; end if;
  return coalesce(jsonb_typeof(link)='object' and link->'version'='1'::jsonb
    and link->>'projectId'=project_id::text and link->>'sourceKind'=source_kind
    and link->>'sourceId'=source_id and link->>'sourceKey'=source_key
    and jsonb_typeof(link->'taskId')='number' and link->'taskId'=task->'id'
    and (link->>'taskId')::numeric>0 and (link->>'taskId')::numeric=trunc((link->>'taskId')::numeric)
    and (link->>'operationId')::uuid is not null and task->'originRef'=link,false);
exception when invalid_text_representation or numeric_value_out_of_range then return false;
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

-- Explicitly detach scheduled work without replacing/deleting its source.
-- Incoming dependencies and hierarchy children must be handled by the user first.
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

create or replace function public.task_plan_write_context_v1()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin return nullif(current_setting('pmworkspace.task_plan_write',true),'')::jsonb;
exception when others then return null;
end; $$;

create or replace function public.guard_manual_task_plan_link_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
declare old_link jsonb; context_value jsonb:=public.task_plan_write_context_v1(); trusted boolean; plan_task jsonb;
begin
  if tg_op='INSERT' then
    if coalesce(new.meta,'{}') ?| array['projectPlanLink','projectPlanOperationIds','projectPlanLastReturn','projectPlanLastLink'] then raise exception using errcode='22023',message='PLAN_LINK_RESERVED'; end if;
    return new;
  end if;
  old_link:=old.meta->'projectPlanLink';
  trusted:=auth.uid() is not null and context_value->>'actor'=auth.uid()::text and context_value->>'sourceKind'='manual' and context_value->>'sourceId'=old.id::text;
  if tg_op='DELETE' then
    if old_link is not null and old_link<>'null'::jsonb and exists(select 1 from public.projects where id=old.project_id) then raise exception using errcode='22023',message='PLAN_SOURCE_LINKED_RETURN_FIRST'; end if;
    return old;
  end if;
  if (new.meta->'projectPlanLink',new.meta->'projectPlanOperationIds',new.meta->'projectPlanLastReturn',new.meta->'projectPlanLastLink') is distinct from (old_link,old.meta->'projectPlanOperationIds',old.meta->'projectPlanLastReturn',old.meta->'projectPlanLastLink') then
    if not coalesce(trusted,false) then raise exception using errcode='22023',message='PLAN_LINK_IMMUTABLE'; end if;
  end if;
  if old_link is not null and old_link<>'null'::jsonb and (new.project_id,new.title,new.due_date,new.status,new.recurrence,new.source_type,new.source_batch_id) is distinct from (old.project_id,old.title,old.due_date,old.status,old.recurrence,old.source_type,old.source_batch_id) and not coalesce(trusted,false) then raise exception using errcode='22023',message='PLAN_SOURCE_FIELDS_READ_ONLY'; end if;
  if new.meta->'projectPlanLink' is not null and new.meta->'projectPlanLink'<>'null'::jsonb then
    select task into plan_task from public.projects project cross join lateral jsonb_array_elements(project.tasks) task where project.id=new.project_id and (task->>'id')::numeric=(new.meta->'projectPlanLink'->>'taskId')::numeric;
    if plan_task is null or not public.task_plan_link_valid_v1(new.meta->'projectPlanLink',new.project_id,'manual',new.id::text,plan_task) then raise exception using errcode='22023',message='PLAN_LINK_INVALID'; end if;
  end if;
  return new;
end; $$;

create or replace function public.guard_project_task_plan_links_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
declare task jsonb; previous_task jsonb; link jsonb; source_item jsonb; old_item jsonb; kind text; task_id numeric; context_value jsonb:=public.task_plan_write_context_v1(); trusted boolean; list_value jsonb; previous_list jsonb; seen_sources jsonb:='{}';
begin
  if tg_op='INSERT' then
    if exists(select 1 from jsonb_array_elements(coalesce(new.tasks,'[]')) where value ? 'originRef') or exists(select 1 from jsonb_array_elements(coalesce(new.registers->'actions','[]')||coalesce(new.tracker,'[]')) where value ?| array['projectPlanLink','projectPlanOperationIds','projectPlanLastReturn','projectPlanLastLink']) then raise exception using errcode='22023',message='PLAN_LINK_RESERVED'; end if;
    return new;
  end if;
  trusted:=auth.uid() is not null and context_value->>'actor'=auth.uid()::text and context_value->>'projectId'=old.id::text;
  for previous_task in select value from jsonb_array_elements(coalesce(old.tasks,'[]')) where value->'originRef' is not null and value->'originRef'<>'null'::jsonb loop
    select value into task from jsonb_array_elements(coalesce(new.tasks,'[]')) where (value->>'id')::numeric=(previous_task->>'id')::numeric;
    if task is null then
      if coalesce(trusted,false) and context_value->>'action'='return' and (context_value->>'taskId')::numeric=(previous_task->>'id')::numeric then continue; end if;
      raise exception using errcode='22023',message='PLAN_TASK_LINKED_RETURN_FIRST';
    end if;
    if task->'originRef' is distinct from previous_task->'originRef' then raise exception using errcode='22023',message='PLAN_ORIGIN_IMMUTABLE'; end if;
  end loop;
  for task in select value from jsonb_array_elements(coalesce(new.tasks,'[]')) where value->'originRef' is not null and value->'originRef'<>'null'::jsonb loop
    link:=task->'originRef'; task_id:=(task->>'id')::numeric; kind:=link->>'sourceKind';
    if not public.task_plan_link_valid_v1(link,new.id,kind,link->>'sourceId',task) or seen_sources ? (link->>'sourceKey') then raise exception using errcode='22023',message='PLAN_ORIGIN_INVALID'; end if;
    seen_sources:=seen_sources||jsonb_build_object(link->>'sourceKey',true);
    if coalesce(trusted,false) and context_value->>'action'='promote' and (context_value->>'taskId')::numeric=task_id and context_value->>'sourceKind'=kind and context_value->>'sourceId'=link->>'sourceId' and context_value->>'operationId'=link->>'operationId' then continue; end if;
    select value into previous_task from jsonb_array_elements(coalesce(old.tasks,'[]')) where value->'id'=task->'id';
    if previous_task is null or previous_task->'originRef' is distinct from link then raise exception using errcode='22023',message='PLAN_LINK_RESERVED'; end if;
    if kind='manual' then select meta->'projectPlanLink' into source_item from public.manual_todos where id=(link->>'sourceId')::uuid and project_id=new.id;
    elsif kind='action' then select value->'projectPlanLink' into source_item from jsonb_array_elements(coalesce(new.registers->'actions','[]')) where value->>'_id'=link->>'sourceId';
    elsif kind='tracker' then select value->'projectPlanLink' into source_item from jsonb_array_elements(coalesce(new.tracker,'[]')) where value->>'_id'=link->>'sourceId';
    else raise exception using errcode='22023',message='PLAN_ORIGIN_INVALID'; end if;
    if source_item is distinct from link then raise exception using errcode='22023',message='PLAN_SOURCE_LINK_INVALID'; end if;
  end loop;
  foreach kind in array array['action','tracker'] loop
    previous_list:=case when kind='action' then coalesce(old.registers->'actions','[]') else coalesce(old.tracker,'[]') end;
    list_value:=case when kind='action' then coalesce(new.registers->'actions','[]') else coalesce(new.tracker,'[]') end;
    for source_item in select value from jsonb_array_elements(list_value) where value ?| array['projectPlanLink','projectPlanOperationIds','projectPlanLastReturn','projectPlanLastLink'] loop
      if coalesce(trusted,false) and context_value->>'sourceKind'=kind and context_value->>'sourceId'=source_item->>'_id' then continue; end if;
      select value into old_item from jsonb_array_elements(previous_list) where value->>'_id'=source_item->>'_id';
      if old_item is null or (source_item->'projectPlanLink',source_item->'projectPlanOperationIds',source_item->'projectPlanLastReturn',source_item->'projectPlanLastLink') is distinct from (old_item->'projectPlanLink',old_item->'projectPlanOperationIds',old_item->'projectPlanLastReturn',old_item->'projectPlanLastLink') then raise exception using errcode='22023',message='PLAN_LINK_RESERVED'; end if;
    end loop;
    for old_item in select value from jsonb_array_elements(previous_list) where value ?| array['projectPlanOperationIds','projectPlanLastReturn','projectPlanLastLink'] loop
      select value into source_item from jsonb_array_elements(list_value) where value->>'_id'=old_item->>'_id';
      if coalesce(trusted,false) and context_value->>'sourceKind'=kind and context_value->>'sourceId'=old_item->>'_id' then continue; end if;
      if source_item is null and (old_item->'projectPlanLink' is null or old_item->'projectPlanLink'='null'::jsonb) then continue; end if;
      if source_item is null or (source_item->'projectPlanOperationIds',source_item->'projectPlanLastReturn',source_item->'projectPlanLastLink') is distinct from (old_item->'projectPlanOperationIds',old_item->'projectPlanLastReturn',old_item->'projectPlanLastLink') then raise exception using errcode='22023',message='PLAN_LINK_IMMUTABLE'; end if;
    end loop;
    for old_item in select value from jsonb_array_elements(previous_list) where value->'projectPlanLink' is not null and value->'projectPlanLink'<>'null'::jsonb loop
      select value into source_item from jsonb_array_elements(list_value) where value->>'_id'=old_item->>'_id';
      if coalesce(trusted,false) and context_value->>'action'='return' and context_value->>'sourceKind'=kind and context_value->>'sourceId'=old_item->>'_id' then continue; end if;
      if source_item is null or source_item->'projectPlanLink' is distinct from old_item->'projectPlanLink' or source_item->'projectPlanOperationIds' is distinct from old_item->'projectPlanOperationIds' then raise exception using errcode='22023',message='PLAN_SOURCE_LINKED_RETURN_FIRST'; end if;
      if kind='action' and (source_item->'description',source_item->'target',source_item->'status',source_item->'completed',source_item->'sourceTaskId') is distinct from (old_item->'description',old_item->'target',old_item->'status',old_item->'completed',old_item->'sourceTaskId') then raise exception using errcode='22023',message='PLAN_SOURCE_FIELDS_READ_ONLY'; end if;
      -- Tracker mirrors may follow plan edits; independently completed tracker
      -- rows cannot override the linked plan's progress.
      if kind='tracker' then
        select value into task from jsonb_array_elements(coalesce(new.tasks,'[]')) where (value->>'id')::numeric=(old_item->'projectPlanLink'->>'taskId')::numeric;
        if source_item->'taskId' is distinct from old_item->'taskId' or (source_item->>'taskName' is distinct from old_item->>'taskName' and source_item->>'taskName' is distinct from task->>'name') or (source_item->>'status'='Completed' and coalesce((task->>'pct')::numeric,0)<100) then raise exception using errcode='22023',message='PLAN_SOURCE_FIELDS_READ_ONLY'; end if;
      end if;
    end loop;
    for source_item in select value from jsonb_array_elements(list_value) where value->'projectPlanLink' is not null and value->'projectPlanLink'<>'null'::jsonb loop
      if (select count(*) from jsonb_array_elements(list_value) where value->>'_id'=source_item->>'_id')<>1 then raise exception using errcode='22023',message='PLAN_SOURCE_ID_INVALID'; end if;
      select value into task from jsonb_array_elements(coalesce(new.tasks,'[]')) where (value->>'id')::numeric=(source_item->'projectPlanLink'->>'taskId')::numeric;
      if task is null or not public.task_plan_link_valid_v1(source_item->'projectPlanLink',new.id,kind,source_item->>'_id',task) then raise exception using errcode='22023',message='PLAN_SOURCE_LINK_INVALID'; end if;
    end loop;
  end loop;
  return new;
end; $$;

drop trigger if exists trg_manual_task_plan_link_guard_v1 on public.manual_todos;
create trigger trg_manual_task_plan_link_guard_v1 before insert or update or delete on public.manual_todos for each row execute function public.guard_manual_task_plan_link_v1();
drop trigger if exists trg_project_task_plan_link_guard_v1 on public.projects;
create trigger trg_project_task_plan_link_guard_v1 before insert or update of tasks,registers,tracker on public.projects for each row execute function public.guard_project_task_plan_links_v1();

-- Existing policy remains unchanged. The bounded transaction context lets an
-- owner move their Other checklist and its items together without deleting IDs.
create or replace function public.can_access_task_card_checklist_item(target_checklist_id uuid,target_project_id uuid,subject_user uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare checklist public.task_card_checklists%rowtype; context_value jsonb;
begin
  select * into checklist from public.task_card_checklists where id=target_checklist_id;
  if not found then return false; end if;
  if checklist.project_id is not distinct from target_project_id and ((checklist.project_id is null and checklist.user_id=subject_user) or public.can_access_project(checklist.project_id,subject_user)) then return true; end if;
  begin context_value:=nullif(current_setting('pmworkspace.task_plan_transfer',true),'')::jsonb; exception when others then return false; end;
  return subject_user is not null and subject_user=auth.uid() and checklist.user_id=subject_user
    and context_value->>'actor'=subject_user::text and context_value->>'sourceKind'='manual'
    and checklist.card_key='manual:'||(context_value->>'sourceId')
    and checklist.project_id=(context_value->>'projectId')::uuid
    and target_project_id is not distinct from (context_value->>'oldProjectId')::uuid
    and public.can_access_project(checklist.project_id,subject_user)
    and exists(select 1 from public.manual_todos source where source.id=(context_value->>'sourceId')::uuid and source.user_id=subject_user and source.project_id=checklist.project_id and source.meta->'projectPlanLink'->>'operationId'=context_value->>'operationId');
end; $$;

revoke all on function public.task_plan_day_v1(text), public.task_plan_business_day_v1(date,integer), public.task_plan_dependencies_v1(jsonb),public.task_plan_graph_v1(jsonb),public.task_plan_timing_v1(jsonb,bigint),public.promote_task_to_project_plan_v1(uuid,text,text,bigint,jsonb,uuid,jsonb) from public,anon;
grant execute on function public.task_plan_day_v1(text), public.task_plan_business_day_v1(date,integer), public.task_plan_dependencies_v1(jsonb),public.task_plan_graph_v1(jsonb),public.task_plan_timing_v1(jsonb,bigint),public.promote_task_to_project_plan_v1(uuid,text,text,bigint,jsonb,uuid,jsonb) to authenticated,service_role;
revoke all on function public.return_task_from_project_plan_v1(uuid,text,text,bigint,jsonb,jsonb,uuid),public.task_plan_link_valid_v1(jsonb,uuid,text,text,jsonb),public.task_plan_write_context_v1(),public.guard_manual_task_plan_link_v1(),public.guard_project_task_plan_links_v1() from public,anon;
grant execute on function public.return_task_from_project_plan_v1(uuid,text,text,bigint,jsonb,jsonb,uuid),public.task_plan_link_valid_v1(jsonb,uuid,text,text,jsonb),public.task_plan_write_context_v1(),public.guard_manual_task_plan_link_v1(),public.guard_project_task_plan_links_v1() to authenticated,service_role;
notify pgrst,'reload schema';
commit;
