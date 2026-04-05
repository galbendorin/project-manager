create or replace function public.patch_project_status_report_field(
  p_project_id uuid,
  p_field text,
  p_value text
)
returns table (
  version bigint,
  status_report jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_project_id is null or coalesce(btrim(p_field), '') = '' then
    raise exception 'Project id and status report field are required.';
  end if;

  return query
  update public.projects p
  set
    status_report = jsonb_set(
      coalesce(p.status_report, '{}'::jsonb),
      array[p_field],
      to_jsonb(p_value),
      true
    ),
    updated_at = timezone('utc', now())
  where p.id = p_project_id
  returning p.version, p.status_report;
end;
$$;

create or replace function public.upsert_project_register_item(
  p_project_id uuid,
  p_register_type text,
  p_item jsonb
)
returns table (
  version bigint,
  registers jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing jsonb := '[]'::jsonb;
  v_updated jsonb := '[]'::jsonb;
  v_item_id text := coalesce(p_item->>'_id', '');
  v_found boolean := false;
begin
  if p_project_id is null or coalesce(btrim(p_register_type), '') = '' or p_item is null then
    raise exception 'Project id, register type, and item payload are required.';
  end if;

  select case
    when jsonb_typeof(coalesce(p.registers, '{}'::jsonb)->p_register_type) = 'array'
      then coalesce(p.registers, '{}'::jsonb)->p_register_type
    else '[]'::jsonb
  end
  into v_existing
  from public.projects p
  where p.id = p_project_id;

  select
    coalesce(jsonb_agg(
      case
        when coalesce(elem->>'_id', '') = v_item_id and v_item_id <> '' then p_item
        else elem
      end
    ), '[]'::jsonb),
    bool_or(coalesce(elem->>'_id', '') = v_item_id and v_item_id <> '')
  into v_updated, v_found
  from jsonb_array_elements(v_existing) elem;

  if not coalesce(v_found, false) then
    v_updated := v_updated || jsonb_build_array(p_item);
  end if;

  return query
  update public.projects p
  set
    registers = jsonb_set(
      coalesce(p.registers, '{}'::jsonb),
      array[p_register_type],
      v_updated,
      true
    ),
    updated_at = timezone('utc', now())
  where p.id = p_project_id
  returning p.version, p.registers;
end;
$$;

create or replace function public.patch_project_register_item(
  p_project_id uuid,
  p_register_type text,
  p_item_id text,
  p_patch jsonb
)
returns table (
  version bigint,
  registers jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing jsonb := '[]'::jsonb;
  v_updated jsonb := '[]'::jsonb;
  v_found boolean := false;
begin
  if p_project_id is null or coalesce(btrim(p_register_type), '') = '' or coalesce(btrim(p_item_id), '') = '' or p_patch is null then
    raise exception 'Project id, register type, item id, and patch payload are required.';
  end if;

  select case
    when jsonb_typeof(coalesce(p.registers, '{}'::jsonb)->p_register_type) = 'array'
      then coalesce(p.registers, '{}'::jsonb)->p_register_type
    else '[]'::jsonb
  end
  into v_existing
  from public.projects p
  where p.id = p_project_id;

  select
    coalesce(jsonb_agg(
      case
        when coalesce(elem->>'_id', '') = p_item_id then elem || p_patch
        else elem
      end
    ), '[]'::jsonb),
    bool_or(coalesce(elem->>'_id', '') = p_item_id)
  into v_updated, v_found
  from jsonb_array_elements(v_existing) elem;

  if not coalesce(v_found, false) then
    v_updated := v_updated || jsonb_build_array(jsonb_build_object('_id', p_item_id) || p_patch);
  end if;

  return query
  update public.projects p
  set
    registers = jsonb_set(
      coalesce(p.registers, '{}'::jsonb),
      array[p_register_type],
      v_updated,
      true
    ),
    updated_at = timezone('utc', now())
  where p.id = p_project_id
  returning p.version, p.registers;
end;
$$;

create or replace function public.delete_project_register_item(
  p_project_id uuid,
  p_register_type text,
  p_item_id text
)
returns table (
  version bigint,
  registers jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing jsonb := '[]'::jsonb;
  v_updated jsonb := '[]'::jsonb;
begin
  if p_project_id is null or coalesce(btrim(p_register_type), '') = '' or coalesce(btrim(p_item_id), '') = '' then
    raise exception 'Project id, register type, and item id are required.';
  end if;

  select case
    when jsonb_typeof(coalesce(p.registers, '{}'::jsonb)->p_register_type) = 'array'
      then coalesce(p.registers, '{}'::jsonb)->p_register_type
    else '[]'::jsonb
  end
  into v_existing
  from public.projects p
  where p.id = p_project_id;

  select
    coalesce(jsonb_agg(elem), '[]'::jsonb)
  into v_updated
  from jsonb_array_elements(v_existing) elem
  where coalesce(elem->>'_id', '') <> p_item_id;

  return query
  update public.projects p
  set
    registers = jsonb_set(
      coalesce(p.registers, '{}'::jsonb),
      array[p_register_type],
      v_updated,
      true
    ),
    updated_at = timezone('utc', now())
  where p.id = p_project_id
  returning p.version, p.registers;
end;
$$;

revoke all on function public.patch_project_status_report_field(uuid, text, text) from anon;
revoke all on function public.upsert_project_register_item(uuid, text, jsonb) from anon;
revoke all on function public.patch_project_register_item(uuid, text, text, jsonb) from anon;
revoke all on function public.delete_project_register_item(uuid, text, text) from anon;

grant execute on function public.patch_project_status_report_field(uuid, text, text) to authenticated;
grant execute on function public.upsert_project_register_item(uuid, text, jsonb) to authenticated;
grant execute on function public.patch_project_register_item(uuid, text, text, jsonb) to authenticated;
grant execute on function public.delete_project_register_item(uuid, text, text) to authenticated;
