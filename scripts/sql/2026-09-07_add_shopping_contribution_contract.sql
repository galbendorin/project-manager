-- Q04 draft. Requires the July 15 v2 migration. Deploy only after staging review.
-- v2 remains callable by older clients; v3 records the evidence needed to undo
-- one pending addition without guessing which part of a shared row it owns.
begin;

create sequence if not exists public.shopping_write_revision_seq;
revoke all on sequence public.shopping_write_revision_seq from public, anon, authenticated;
alter table public.manual_todos
  add column if not exists shopping_revision bigint not null default 0;

create or replace function public.stamp_shopping_write_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A sequence also detects delete/reinsert with the same UUID and changes
  -- subsequently reverted. Ignore any revision supplied by a client.
  new.shopping_revision := nextval('public.shopping_write_revision_seq'::regclass);
  return new;
end;
$$;
revoke all on function public.stamp_shopping_write_revision() from public, anon, authenticated;
drop trigger if exists trg_manual_todos_shopping_revision on public.manual_todos;
create trigger trg_manual_todos_shopping_revision before insert or update
on public.manual_todos for each row execute function public.stamp_shopping_write_revision();

create table if not exists public.shopping_contributions (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  submitted_payload jsonb not null,
  contribution jsonb,
  confirmed_revision bigint not null default 0 check (confirmed_revision >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.shopping_contribution_intents (
  operation_id uuid not null references public.shopping_contributions(operation_id) on delete cascade,
  desired_revision bigint not null check (desired_revision > 0),
  intent_id uuid not null unique,
  desired_payload jsonb not null,
  result jsonb not null,
  primary key (operation_id, desired_revision)
);
alter table public.shopping_contributions enable row level security;
alter table public.shopping_contribution_intents enable row level security;
revoke all on table public.shopping_contributions, public.shopping_contribution_intents
  from public, anon, authenticated;

-- Private helper. Caller holds the normalized title lock. Record and mutate
-- the exact same locked row: a second lookup could select a concurrent direct
-- insert and incorrectly label somebody else's row as this operation's insert.
create or replace function public.record_shopping_contribution(
  project_id uuid, payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  before_row public.manual_todos%rowtype;
  saved_row public.manual_todos%rowtype;
  quantity numeric := (payload->>'quantity_value')::numeric;
  unit text := coalesce(payload->>'quantity_unit', '');
  next_quantity numeric;
  next_unit text;
begin
  select mt.* into before_row from public.manual_todos mt
  where mt.project_id = record_shopping_contribution.project_id
    and mt.status <> 'Done'
    and public.normalize_shopping_title(mt.title) = public.normalize_shopping_title(payload->>'title')
  order by mt.created_at, mt.id limit 1 for update;

  if before_row.id is null then
    insert into public.manual_todos(user_id, project_id, title, assignee_user_id,
      quantity_value, quantity_unit, source_type, source_batch_id, meta)
    values (auth.uid(), project_id, btrim(payload->>'title'), auth.uid(), quantity, unit,
      coalesce(payload->>'source_type', ''), (payload->>'source_batch_id')::uuid, payload->'meta')
      returning * into saved_row;
  else
    -- Keep the established v2 quantity/unit rules, including its replacement
    -- behavior for a missing unit and exact before-image restoration on undo.
    next_quantity := before_row.quantity_value;
    next_unit := coalesce(before_row.quantity_unit, '');
    if quantity is not null then
      if before_row.quantity_value is null then
        next_quantity := quantity;
        next_unit := unit;
      elsif lower(btrim(unit)) <> '' and lower(btrim(next_unit)) = lower(btrim(unit)) then
        next_quantity := round((before_row.quantity_value + quantity)::numeric, 2);
        next_unit := unit;
      elsif lower(btrim(next_unit)) = '' and lower(btrim(unit)) <> '' then
        next_quantity := quantity;
        next_unit := unit;
      end if;
    end if;
    update public.manual_todos set quantity_value = next_quantity, quantity_unit = next_unit,
      source_type = case when coalesce(source_type, '') = '' then coalesce(payload->>'source_type', '') else source_type end,
      source_batch_id = coalesce(source_batch_id, (payload->>'source_batch_id')::uuid),
      meta = case when coalesce(meta, '{}'::jsonb) = '{}'::jsonb then payload->'meta' else meta end,
      updated_at = timezone('utc', now()) where id = before_row.id returning * into saved_row;
  end if;
  return jsonb_build_object(
    'kind', case when before_row.id is null then 'inserted' else 'merged' end,
    'row_id', saved_row.id, 'revision', saved_row.shopping_revision::text,
    'before', case when before_row.id is null then null else to_jsonb(before_row) end,
    'after', to_jsonb(saved_row)
  );
end;
$$;
revoke all on function public.record_shopping_contribution(uuid, jsonb) from public, anon, authenticated;

create or replace function public.apply_shopping_list_add_v3(
  target_operation_id uuid, target_project_id uuid, target_title text,
  target_quantity_value numeric default null, target_quantity_unit text default '',
  target_source_type text default '', target_source_batch_id uuid default null,
  target_meta jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  subject uuid := auth.uid();
  payload jsonb;
  receipt public.shopping_contributions%rowtype;
  current_row public.manual_todos%rowtype;
  evidence jsonb;
  replay boolean := false;
begin
  if subject is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if target_operation_id is null or target_project_id is null
    or public.normalize_shopping_title(target_title) = ''
    or (target_quantity_value is not null and (target_quantity_value < 0
      or target_quantity_value::text in ('NaN', 'Infinity', '-Infinity')))
    or jsonb_typeof(coalesce(target_meta, '{}'::jsonb)) <> 'object'
  then raise exception 'SHOPPING_ITEM_INVALID'; end if;
  if not public.can_access_project(target_project_id, subject)
  then raise exception 'PROJECT_ACCESS_REQUIRED'; end if;

  payload := jsonb_build_object('title', btrim(target_title),
    'quantity_value', target_quantity_value, 'quantity_unit', coalesce(target_quantity_unit, ''),
    'source_type', coalesce(target_source_type, ''), 'source_batch_id', target_source_batch_id,
    'meta', coalesce(target_meta, '{}'::jsonb));
  -- Match v2's operation lock so a legacy request cannot race this receipt.
  perform pg_advisory_xact_lock(hashtext(subject::text || ':' || target_operation_id::text));
  select * into receipt from public.shopping_contributions
    where operation_id = target_operation_id for update;
  if found then
    if receipt.user_id <> subject or receipt.project_id <> target_project_id
    then raise exception 'SHOPPING_OPERATION_ACCESS_REQUIRED'; end if;
    if receipt.submitted_payload <> payload then raise exception 'SHOPPING_OPERATION_PAYLOAD_MISMATCH'; end if;
    replay := true;
    evidence := receipt.contribution;
  else
    if exists (select 1 from public.shopping_list_operation_receipts where operation_id = target_operation_id)
    then raise exception 'SHOPPING_LEGACY_OPERATION_NEEDS_REVIEW'; end if;
    perform pg_advisory_xact_lock(hashtext(target_project_id::text || ':' || public.normalize_shopping_title(target_title)));
    evidence := public.record_shopping_contribution(target_project_id, payload);
    insert into public.shopping_contributions(operation_id, user_id, project_id, submitted_payload, contribution)
      values (target_operation_id, subject, target_project_id, payload, evidence)
      returning * into receipt;
  end if;
  select * into current_row from public.manual_todos
    where id = (evidence->>'row_id')::uuid and project_id = target_project_id;
  return jsonb_build_object('outcome', case when replay then 'already_applied' else 'applied' end,
    'operation_id', target_operation_id, 'project_id', target_project_id, 'user_id', subject,
    'confirmed_revision', receipt.confirmed_revision::text, 'contribution', evidence,
    'row_exists', current_row.id is not null,
    'current_item', case when current_row.id is null then null else to_jsonb(current_row) end);
end;
$$;
revoke all on function public.apply_shopping_list_add_v3(uuid, uuid, text, numeric, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_shopping_list_add_v3(uuid, uuid, text, numeric, text, text, uuid, jsonb) to authenticated;

create or replace function public.reconcile_shopping_contribution_v1(
  target_operation_id uuid, target_project_id uuid, target_intent_id uuid,
  target_desired_revision bigint, target_cancel boolean,
  target_title text default null, target_quantity_value numeric default null,
  target_quantity_unit text default '', target_status text default 'Open'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  subject uuid := auth.uid();
  receipt public.shopping_contributions%rowtype;
  prior_intent public.shopping_contribution_intents%rowtype;
  current_row public.manual_todos%rowtype;
  before_row public.manual_todos%rowtype;
  desired jsonb;
  replacement jsonb;
  evidence jsonb;
  result jsonb;
  lock_key integer;
  new_row public.manual_todos%rowtype;
  latest_received_revision bigint;
  removed_ids jsonb := '[]'::jsonb;
  affected_items jsonb := '[]'::jsonb;
begin
  if subject is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if target_operation_id is null or target_project_id is null or target_intent_id is null
    or target_desired_revision is null or target_desired_revision <= 0 or target_cancel is null
  then raise exception 'SHOPPING_INTENT_INVALID'; end if;
  if not public.can_access_project(target_project_id, subject)
  then raise exception 'PROJECT_ACCESS_REQUIRED'; end if;
  if not target_cancel and (public.normalize_shopping_title(target_title) = ''
    or target_status is null or target_status not in ('Open', 'Done')
    or (target_quantity_value is not null and (target_quantity_value < 0
      or target_quantity_value::text in ('NaN', 'Infinity', '-Infinity'))))
  then raise exception 'SHOPPING_ITEM_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtext(subject::text || ':' || target_operation_id::text));
  select * into receipt from public.shopping_contributions
    where operation_id = target_operation_id for update;
  if not found then raise exception 'SHOPPING_OPERATION_NOT_FOUND'; end if;
  if receipt.user_id <> subject or receipt.project_id <> target_project_id
  then raise exception 'SHOPPING_OPERATION_ACCESS_REQUIRED'; end if;
  desired := case when target_cancel then jsonb_build_object('cancel', true)
    else jsonb_build_object('cancel', false, 'title', btrim(target_title),
      'quantity_value', target_quantity_value, 'quantity_unit', coalesce(target_quantity_unit, ''),
      'status', target_status) end;
  select coalesce(max(desired_revision), 0) into latest_received_revision
    from public.shopping_contribution_intents where operation_id = target_operation_id;

  select * into prior_intent from public.shopping_contribution_intents
    where operation_id = target_operation_id and desired_revision = target_desired_revision;
  if found then
    if prior_intent.intent_id <> target_intent_id or prior_intent.desired_payload <> desired
    then raise exception 'SHOPPING_INTENT_PAYLOAD_MISMATCH'; end if;
    -- Receipt is historical evidence, never a fresh row to hydrate into a list.
    return prior_intent.result || jsonb_build_object('replayed', true,
      'latest_confirmed_revision', receipt.confirmed_revision::text,
      'latest_received_revision', latest_received_revision::text);
  end if;
  if exists (select 1 from public.shopping_contribution_intents where intent_id = target_intent_id)
  then raise exception 'SHOPPING_INTENT_ID_REUSED'; end if;

  if target_desired_revision <= greatest(receipt.confirmed_revision, latest_received_revision) then
    result := jsonb_build_object('outcome', 'superseded');
  else
    -- All source/destination title locks use v2's namespace and a single order.
    for lock_key in select distinct hashtext(target_project_id::text || ':' || title)
      from (values (public.normalize_shopping_title(receipt.contribution->'after'->>'title')),
        (case when target_cancel then null else public.normalize_shopping_title(target_title) end)) titles(title)
      where title is not null and title <> '' order by 1
    loop perform pg_advisory_xact_lock(lock_key); end loop;

    -- Lock possible destination and source rows in UUID order before changing either.
    perform mt.id from public.manual_todos mt where mt.project_id = target_project_id
      and (mt.id = (receipt.contribution->>'row_id')::uuid
        or (not target_cancel and mt.status <> 'Done'
          and public.normalize_shopping_title(mt.title) = public.normalize_shopping_title(target_title)))
      order by mt.id for update;
    select * into current_row from public.manual_todos
      where id = (receipt.contribution->>'row_id')::uuid and project_id = target_project_id;
    if receipt.contribution is not null and (current_row.id is null
      or current_row.shopping_revision <> (receipt.contribution->>'revision')::bigint) then
      result := jsonb_build_object('outcome', 'needs_review', 'reason', 'contribution_changed_or_missing');
    elsif not target_cancel and target_status = 'Done' and exists (
      select 1 from public.manual_todos mt where mt.project_id = target_project_id and mt.status <> 'Done'
        and public.normalize_shopping_title(mt.title) = public.normalize_shopping_title(target_title)
        and (mt.id <> current_row.id or receipt.contribution->>'kind' = 'merged' or current_row.id is null)
    ) then
      -- Completing a contribution must not complete somebody else's open item.
      result := jsonb_build_object('outcome', 'needs_review', 'reason', 'completion_would_change_shared_item');
    else
      begin
        if receipt.contribution->>'kind' = 'inserted' then
          delete from public.manual_todos where id = current_row.id;
          removed_ids := jsonb_build_array(current_row.id);
        elsif receipt.contribution->>'kind' = 'merged' then
          before_row := jsonb_populate_record(null::public.manual_todos, receipt.contribution->'before');
          update public.manual_todos set quantity_value = before_row.quantity_value,
            quantity_unit = before_row.quantity_unit, source_type = before_row.source_type,
            source_batch_id = before_row.source_batch_id, meta = before_row.meta,
            updated_at = timezone('utc', now()) where id = current_row.id returning * into new_row;
          affected_items := jsonb_build_array(to_jsonb(new_row));
        end if;
        evidence := null;
        if not target_cancel then
          replacement := receipt.submitted_payload || (desired - 'cancel' - 'status');
          evidence := public.record_shopping_contribution(target_project_id, replacement);
          if target_status = 'Done' then
            -- A direct insert can appear after the earlier destination check.
            -- Roll back the entire undo/re-add subtransaction in that case.
            if evidence->>'kind' = 'merged' then
              raise exception using errcode = 'P0404', message = 'SHOPPING_SHARED_COMPLETION';
            end if;
            update public.manual_todos set status = 'Done', completed_at = timezone('utc', now()),
              updated_at = timezone('utc', now()) where id = (evidence->>'row_id')::uuid
              returning * into new_row;
            evidence := evidence || jsonb_build_object('after', to_jsonb(new_row), 'revision', new_row.shopping_revision::text);
          end if;
          -- Same-title replacement may update the restored source again. Return
          -- only its final transaction image, never two competing versions.
          select coalesce(jsonb_agg(item), '[]'::jsonb) into affected_items
            from jsonb_array_elements(affected_items) item where item->>'id' <> evidence->>'row_id';
          affected_items := affected_items || jsonb_build_array(evidence->'after');
        end if;
        update public.shopping_contributions set contribution = evidence,
          confirmed_revision = target_desired_revision where operation_id = target_operation_id;
        receipt.confirmed_revision := target_desired_revision;
        result := jsonb_build_object('outcome', 'applied', 'contribution', evidence,
          'removed_row_ids', removed_ids, 'affected_items', affected_items);
      exception when sqlstate 'P0404' then
        result := jsonb_build_object('outcome', 'needs_review', 'reason', 'completion_would_change_shared_item');
      end;
    end if;
  end if;
  result := result || jsonb_build_object('operation_id', target_operation_id,
    'desired_revision', target_desired_revision::text, 'confirmed_revision', receipt.confirmed_revision::text,
    'latest_received_revision', greatest(latest_received_revision, target_desired_revision)::text,
    'replayed', false);
  insert into public.shopping_contribution_intents(operation_id, desired_revision, intent_id, desired_payload, result)
    values (target_operation_id, target_desired_revision, target_intent_id, desired, result);
  return result;
end;
$$;
revoke all on function public.reconcile_shopping_contribution_v1(uuid, uuid, uuid, bigint, boolean, text, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_shopping_contribution_v1(uuid, uuid, uuid, bigint, boolean, text, numeric, text, text) to authenticated;
-- Harden the legacy replay boundary too. Preserve authorized old-client
-- behavior, including its historical missing-row response, but never allow
-- a v3 operation to be silently re-applied by an older client.
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

    if existing_receipt.project_id is distinct from target_project_id then
      raise exception using errcode = 'P0001', message = 'SHOPPING_OPERATION_ACCESS_REQUIRED';
    end if;
    if not public.can_access_project(existing_receipt.project_id, current_user_id) then
      raise exception using errcode = 'P0001', message = 'PROJECT_ACCESS_REQUIRED';
    end if;

    select *
    into saved_row
    from public.manual_todos
    where id = existing_receipt.todo_id and project_id = existing_receipt.project_id;

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

  if exists (select 1 from public.shopping_contributions where operation_id = target_operation_id) then
    raise exception using errcode = 'P0001', message = 'SHOPPING_OPERATION_REQUIRES_V3';
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
commit;
