begin;

create extension if not exists pgcrypto;

create table if not exists public.finance_month_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  balance_as_of_date date null,
  actual_opening_cash_pence bigint null,
  actual_closing_cash_pence bigint null,
  planned_opening_cash_pence bigint null,
  planned_income_pence bigint null check (planned_income_pence is null or planned_income_pence >= 0),
  planned_expense_pence bigint null check (planned_expense_pence is null or planned_expense_pence >= 0),
  planned_closing_cash_pence bigint null,
  note text not null default '',
  version integer not null default 1 check (version >= 1),
  finalize_token uuid null,
  finalized_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, month),
  check (month = date_trunc('month', month)::date),
  check (
    balance_as_of_date is null
    or date_trunc('month', balance_as_of_date)::date = month
  ),
  check (
    (status = 'draft' and finalized_at is null)
    or (status = 'finalized' and finalized_at is not null)
  )
);

create table if not exists public.finance_month_reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.finance_month_reconciliations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid null references public.finance_categories(id) on delete set null,
  budget_item_id uuid null references public.finance_budget_items(id) on delete set null,
  promoted_budget_item_id uuid null references public.finance_budget_items(id) on delete set null,
  occurred_on date null,
  kind text not null check (kind in (
    'extra_expense',
    'expense_over',
    'expense_under',
    'income_lower',
    'income_higher',
    'money_out',
    'money_in',
    'unknown_out',
    'unknown_in'
  )),
  flow_type text not null default 'expense' check (flow_type in ('income', 'expense', 'adjustment')),
  description text not null check (char_length(trim(description)) between 1 and 160),
  variance_pence bigint not null check (variance_pence <> 0),
  planned_amount_pence bigint null check (planned_amount_pence is null or planned_amount_pence >= 0),
  actual_amount_pence bigint null check (actual_amount_pence is null or actual_amount_pence >= 0),
  group_snapshot text not null default '',
  budget_item_snapshot text not null default '',
  classification_snapshot text not null default 'essential' check (classification_snapshot in ('essential', 'discretionary', 'wealth_building')),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_finance_month_reconciliations_user_month
  on public.finance_month_reconciliations(user_id, month desc);
create index if not exists idx_finance_month_reconciliation_lines_parent_sort
  on public.finance_month_reconciliation_lines(reconciliation_id, sort_order, created_at);
create index if not exists idx_finance_month_reconciliation_lines_user_date
  on public.finance_month_reconciliation_lines(user_id, occurred_on desc);

drop trigger if exists trg_finance_month_reconciliations_updated_at on public.finance_month_reconciliations;
create trigger trg_finance_month_reconciliations_updated_at
before update on public.finance_month_reconciliations
for each row execute function public.bump_finance_updated_at();

drop trigger if exists trg_finance_month_reconciliation_lines_updated_at on public.finance_month_reconciliation_lines;
create trigger trg_finance_month_reconciliation_lines_updated_at
before update on public.finance_month_reconciliation_lines
for each row execute function public.bump_finance_updated_at();

create or replace function public.validate_finance_reconciliation_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_row public.finance_month_reconciliations;
begin
  select * into parent_row
  from public.finance_month_reconciliations
  where id = new.reconciliation_id;

  if not found or parent_row.user_id <> new.user_id then
    raise exception 'The reconciliation line must belong to the same user as its month.';
  end if;
  if parent_row.status <> 'draft' then
    raise exception 'Reopen this month before changing its explanations.';
  end if;
  if new.occurred_on is not null
    and date_trunc('month', new.occurred_on)::date <> parent_row.month then
    raise exception 'The explanation date must be inside the reconciliation month.';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.finance_categories
    where id = new.category_id and user_id = new.user_id
  ) then
    raise exception 'The selected category does not belong to this user.';
  end if;
  if new.budget_item_id is not null and not exists (
    select 1 from public.finance_budget_items
    where id = new.budget_item_id and user_id = new.user_id
  ) then
    raise exception 'The selected budget item does not belong to this user.';
  end if;
  if new.promoted_budget_item_id is not null and not exists (
    select 1 from public.finance_budget_items
    where id = new.promoted_budget_item_id and user_id = new.user_id
  ) then
    raise exception 'The future budget item does not belong to this user.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_finance_reconciliation_line on public.finance_month_reconciliation_lines;
create trigger trg_validate_finance_reconciliation_line
before insert or update on public.finance_month_reconciliation_lines
for each row execute function public.validate_finance_reconciliation_line();

alter table public.finance_month_reconciliations enable row level security;
alter table public.finance_month_reconciliation_lines enable row level security;

drop policy if exists finance_month_reconciliations_select on public.finance_month_reconciliations;
create policy finance_month_reconciliations_select
on public.finance_month_reconciliations for select
using (user_id = auth.uid());

drop policy if exists finance_month_reconciliations_insert on public.finance_month_reconciliations;
create policy finance_month_reconciliations_insert
on public.finance_month_reconciliations for insert
with check (user_id = auth.uid() and status = 'draft');

drop policy if exists finance_month_reconciliations_update_draft on public.finance_month_reconciliations;
create policy finance_month_reconciliations_update_draft
on public.finance_month_reconciliations for update
using (user_id = auth.uid() and status = 'draft')
with check (user_id = auth.uid() and status = 'draft');

drop policy if exists finance_month_reconciliations_delete_draft on public.finance_month_reconciliations;
create policy finance_month_reconciliations_delete_draft
on public.finance_month_reconciliations for delete
using (user_id = auth.uid());

drop policy if exists finance_month_reconciliation_lines_select on public.finance_month_reconciliation_lines;
create policy finance_month_reconciliation_lines_select
on public.finance_month_reconciliation_lines for select
using (user_id = auth.uid());

drop policy if exists finance_month_reconciliation_lines_insert on public.finance_month_reconciliation_lines;
create policy finance_month_reconciliation_lines_insert
on public.finance_month_reconciliation_lines for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.finance_month_reconciliations parent
    where parent.id = reconciliation_id
      and parent.user_id = auth.uid()
      and parent.status = 'draft'
  )
);

drop policy if exists finance_month_reconciliation_lines_update on public.finance_month_reconciliation_lines;
create policy finance_month_reconciliation_lines_update
on public.finance_month_reconciliation_lines for update
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.finance_month_reconciliations parent
    where parent.id = reconciliation_id
      and parent.user_id = auth.uid()
      and parent.status = 'draft'
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.finance_month_reconciliations parent
    where parent.id = reconciliation_id
      and parent.user_id = auth.uid()
      and parent.status = 'draft'
  )
);

drop policy if exists finance_month_reconciliation_lines_delete on public.finance_month_reconciliation_lines;
create policy finance_month_reconciliation_lines_delete
on public.finance_month_reconciliation_lines for delete
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.finance_month_reconciliations parent
    where parent.id = reconciliation_id
      and parent.user_id = auth.uid()
      and parent.status = 'draft'
  )
);

create or replace function public.finalize_finance_month_reconciliation(
  p_reconciliation_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid
)
returns public.finance_month_reconciliations
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.finance_month_reconciliations;
  explained_pence bigint;
  monthly_variance_pence bigint;
  residual_pence bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select * into target_row
  from public.finance_month_reconciliations
  where id = p_reconciliation_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Reconciliation month not found.';
  end if;
  if target_row.status = 'finalized' and target_row.finalize_token = p_idempotency_key then
    return target_row;
  end if;
  if target_row.status <> 'draft' then
    raise exception 'This month is already finalized. Reopen it before making changes.';
  end if;
  if target_row.version <> p_expected_version then
    raise exception 'This month changed in another tab. Refresh and try again.';
  end if;
  if target_row.month >= date_trunc('month', timezone('Europe/London', now()))::date then
    raise exception 'Only completed months can be finalized.';
  end if;
  if target_row.actual_opening_cash_pence is null or target_row.actual_closing_cash_pence is null then
    raise exception 'Add both the opening and closing savings balances.';
  end if;
  if target_row.planned_opening_cash_pence is null
    or target_row.planned_income_pence is null
    or target_row.planned_expense_pence is null
    or target_row.planned_closing_cash_pence is null then
    raise exception 'Refresh the planned month before finalizing.';
  end if;

  select coalesce(sum(variance_pence), 0) into explained_pence
  from public.finance_month_reconciliation_lines
  where reconciliation_id = target_row.id and user_id = target_row.user_id;

  monthly_variance_pence :=
    (target_row.actual_closing_cash_pence - target_row.actual_opening_cash_pence)
    - (target_row.planned_income_pence - target_row.planned_expense_pence);
  residual_pence := monthly_variance_pence - explained_pence;

  if abs(residual_pence) > 1 then
    raise exception 'There is still an unexplained difference of % pence.', residual_pence;
  end if;

  update public.finance_month_reconciliations
  set status = 'finalized',
      finalized_at = timezone('utc', now()),
      finalize_token = p_idempotency_key,
      version = version + 1
  where id = target_row.id
  returning * into target_row;

  insert into public.finance_balance_snapshots (
    user_id,
    as_of_month,
    cash_balance_pence,
    note
  ) values (
    target_row.user_id,
    target_row.month,
    target_row.actual_closing_cash_pence,
    'Finalized monthly reconciliation'
  )
  on conflict (user_id, as_of_month)
  do update set
    cash_balance_pence = excluded.cash_balance_pence,
    note = excluded.note;

  return target_row;
end;
$$;

create or replace function public.reopen_finance_month_reconciliation(
  p_reconciliation_id uuid,
  p_expected_version integer
)
returns public.finance_month_reconciliations
language plpgsql
security definer
set search_path = public
as $$
declare
  target_row public.finance_month_reconciliations;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select * into target_row
  from public.finance_month_reconciliations
  where id = p_reconciliation_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Reconciliation month not found.';
  end if;
  if target_row.version <> p_expected_version then
    raise exception 'This month changed in another tab. Refresh and try again.';
  end if;
  if target_row.status = 'draft' then
    return target_row;
  end if;

  update public.finance_month_reconciliations
  set status = 'draft',
      finalized_at = null,
      finalize_token = null,
      version = version + 1
  where id = target_row.id
  returning * into target_row;

  return target_row;
end;
$$;

revoke all on function public.finalize_finance_month_reconciliation(uuid, integer, uuid) from public;
grant execute on function public.finalize_finance_month_reconciliation(uuid, integer, uuid) to authenticated;
revoke all on function public.reopen_finance_month_reconciliation(uuid, integer) from public;
grant execute on function public.reopen_finance_month_reconciliation(uuid, integer) to authenticated;

commit;
