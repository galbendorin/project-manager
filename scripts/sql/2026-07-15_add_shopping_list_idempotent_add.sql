create table if not exists public.shopping_list_operation_receipts (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  todo_id uuid references public.manual_todos(id) on delete set null,
  operation_kind text not null default 'shopping_add',
  response_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.shopping_list_operation_receipts enable row level security;

revoke all on table public.shopping_list_operation_receipts from anon, authenticated;

create or replace function public.apply_shopping_list_add_v2(
  target_operation_id uuid,
  target_project_id uuid,
  target_title text,
  target_quantity_value numeric default null,
  target_quantity_unit text default '',
  target_source_type text default '',
  target_source_batch_id uuid default null,
  target_meta jsonb default '{}'::jsonb
)
returns public.manual_todos
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_title text := public.normalize_shopping_title(target_title);
  normalized_unit text := lower(btrim(coalesce(target_quantity_unit, '')));
  existing_receipt public.shopping_list_operation_receipts%rowtype;
  existing_row public.manual_todos%rowtype;
  saved_row public.manual_todos%rowtype;
  next_quantity numeric;
  next_unit text;
  safe_meta jsonb := case when jsonb_typeof(coalesce(target_meta, '{}'::jsonb)) = 'object' then coalesce(target_meta, '{}'::jsonb) else '{}'::jsonb end;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if target_operation_id is null then
    raise exception using errcode = 'P0001', message = 'SHOPPING_OPERATION_ID_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext(current_user_id::text || ':' || target_operation_id::text));

  select *
  into existing_receipt
  from public.shopping_list_operation_receipts
  where operation_id = target_operation_id
  for update;

  if found then
    if existing_receipt.user_id <> current_user_id then
      raise exception using errcode = 'P0001', message = 'SHOPPING_OPERATION_ACCESS_REQUIRED';
    end if;

    select *
    into saved_row
    from public.manual_todos
    where id = existing_receipt.todo_id;

    if found then
      return saved_row;
    end if;

    return jsonb_populate_record(null::public.manual_todos, existing_receipt.response_snapshot);
  end if;

  if target_project_id is null or normalized_title = '' then
    raise exception using errcode = 'P0001', message = 'SHOPPING_ITEM_INVALID';
  end if;

  if not public.can_access_project(target_project_id, current_user_id) then
    raise exception using errcode = 'P0001', message = 'PROJECT_ACCESS_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext(coalesce(target_project_id::text, '') || ':' || normalized_title));

  select *
  into existing_row
  from public.manual_todos mt
  where mt.project_id = target_project_id
    and mt.status <> 'Done'
    and public.normalize_shopping_title(mt.title) = normalized_title
  order by mt.created_at asc, mt.id asc
  limit 1
  for update;

  if found then
    next_quantity := existing_row.quantity_value;
    next_unit := coalesce(existing_row.quantity_unit, '');

    if target_quantity_value is not null then
      if existing_row.quantity_value is null then
        next_quantity := target_quantity_value;
        next_unit := coalesce(target_quantity_unit, '');
      elsif normalized_unit <> '' and lower(btrim(coalesce(existing_row.quantity_unit, ''))) = normalized_unit then
        next_quantity := round((existing_row.quantity_value + target_quantity_value)::numeric, 2);
        next_unit := coalesce(target_quantity_unit, '');
      elsif lower(btrim(coalesce(existing_row.quantity_unit, ''))) = '' and normalized_unit <> '' then
        next_quantity := target_quantity_value;
        next_unit := coalesce(target_quantity_unit, '');
      end if;
    end if;

    update public.manual_todos
    set
      quantity_value = next_quantity,
      quantity_unit = next_unit,
      source_type = case
        when coalesce(source_type, '') = '' then coalesce(target_source_type, '')
        else source_type
      end,
      source_batch_id = coalesce(source_batch_id, target_source_batch_id),
      meta = case
        when coalesce(meta, '{}'::jsonb) = '{}'::jsonb then safe_meta
        else meta
      end,
      updated_at = timezone('utc', now())
    where id = existing_row.id
    returning * into saved_row;
  else
    insert into public.manual_todos (
      user_id,
      project_id,
      title,
      due_date,
      owner_text,
      assignee_user_id,
      status,
      recurrence,
      completed_at,
      quantity_value,
      quantity_unit,
      source_type,
      source_batch_id,
      meta
    ) values (
      current_user_id,
      target_project_id,
      btrim(target_title),
      null,
      '',
      current_user_id,
      'Open',
      null,
      null,
      target_quantity_value,
      coalesce(target_quantity_unit, ''),
      coalesce(target_source_type, ''),
      target_source_batch_id,
      safe_meta
    )
    returning * into saved_row;
  end if;

  insert into public.shopping_list_operation_receipts (
    operation_id,
    user_id,
    project_id,
    todo_id,
    operation_kind,
    response_snapshot
  ) values (
    target_operation_id,
    current_user_id,
    target_project_id,
    saved_row.id,
    'shopping_add',
    to_jsonb(saved_row)
  );

  return saved_row;
end;
$$;

revoke all on function public.apply_shopping_list_add_v2(uuid, uuid, text, numeric, text, text, uuid, jsonb) from public;
grant execute on function public.apply_shopping_list_add_v2(uuid, uuid, text, numeric, text, text, uuid, jsonb) to authenticated;
