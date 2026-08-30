begin;

create extension if not exists pgcrypto;

create table if not exists public.finance_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency_code text not null default 'GBP' check (char_length(currency_code) = 3),
  opening_cash_pence bigint not null default 0,
  forecast_start_month date not null default date_trunc('month', current_date)::date,
  emergency_target_months integer not null default 6 check (emergency_target_months between 1 and 60),
  protected_cash_floor_pence bigint not null default 0,
  annual_expense_inflation_bps integer not null default 250 check (annual_expense_inflation_bps between 0 and 10000),
  annual_income_growth_bps integer not null default 0 check (annual_income_growth_bps between 0 and 10000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  flow_type text not null check (flow_type in ('income', 'expense')),
  classification text not null default 'essential' check (classification in ('essential', 'discretionary', 'wealth_building')),
  sort_order integer not null default 0,
  archived_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name, flow_type)
);

create table if not exists public.finance_budget_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid null references public.finance_categories(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  amount_pence bigint not null check (amount_pence >= 0),
  flow_type text not null check (flow_type in ('income', 'expense')),
  classification text not null default 'essential' check (classification in ('essential', 'discretionary', 'wealth_building')),
  cash_treatment text not null default 'cash_outflow' check (cash_treatment in ('cash_outflow', 'internal_transfer')),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'annual', 'one_off')),
  start_month date not null default date_trunc('month', current_date)::date,
  end_month date null,
  annual_month integer null check (annual_month between 1 and 12),
  annual_growth_bps integer null check (annual_growth_bps between 0 and 10000),
  owner_label text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_month is null or end_month >= start_month),
  check ((frequency <> 'annual') or annual_month is not null),
  check ((frequency <> 'one_off') or end_month is null)
);

create table if not exists public.finance_actual_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid null references public.finance_categories(id) on delete set null,
  budget_item_id uuid null references public.finance_budget_items(id) on delete set null,
  occurred_on date not null,
  amount_pence bigint not null check (amount_pence >= 0),
  flow_type text not null check (flow_type in ('income', 'expense')),
  cash_treatment text not null default 'cash_outflow' check (cash_treatment in ('cash_outflow', 'internal_transfer')),
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.finance_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  as_of_month date not null,
  cash_balance_pence bigint not null,
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, as_of_month)
);

create table if not exists public.finance_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  goal_type text not null default 'sinking_fund' check (goal_type in ('emergency', 'sinking_fund', 'savings', 'investment', 'major_purchase')),
  current_balance_pence bigint not null default 0,
  target_balance_pence bigint null check (target_balance_pence is null or target_balance_pence >= 0),
  target_date date null,
  monthly_contribution_pence bigint not null default 0 check (monthly_contribution_pence >= 0),
  priority integer not null default 3 check (priority between 1 and 5),
  is_protected boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.finance_mortgages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Home mortgage',
  outstanding_balance_pence bigint not null check (outstanding_balance_pence >= 0),
  annual_rate_bps integer not null check (annual_rate_bps between 0 and 10000),
  remaining_months integer not null check (remaining_months between 1 and 600),
  contractual_payment_pence bigint not null default 0 check (contractual_payment_pence >= 0),
  voluntary_overpayment_pence bigint not null default 0 check (voluntary_overpayment_pence >= 0),
  property_value_pence bigint null check (property_value_pence is null or property_value_pence > 0),
  fixed_rate_end_date date null,
  expected_future_rate_bps integer null check (expected_future_rate_bps between 0 and 10000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.finance_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '',
  color text not null default '#7c3aed',
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

create table if not exists public.finance_scenario_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid not null references public.finance_scenarios(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  effective_month date not null,
  change_type text not null check (change_type in ('income', 'expense', 'purchase', 'financing', 'saving')),
  amount_pence bigint not null default 0,
  frequency text not null default 'one_off' check (frequency in ('monthly', 'annual', 'one_off')),
  classification text not null default 'essential' check (classification in ('essential', 'discretionary', 'wealth_building')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_finance_categories_user_sort on public.finance_categories(user_id, sort_order);
create index if not exists idx_finance_budget_items_user_start on public.finance_budget_items(user_id, start_month);
create index if not exists idx_finance_actual_entries_user_date on public.finance_actual_entries(user_id, occurred_on desc);
create index if not exists idx_finance_balance_snapshots_user_month on public.finance_balance_snapshots(user_id, as_of_month desc);
create index if not exists idx_finance_goals_user_priority on public.finance_goals(user_id, priority, created_at);
create index if not exists idx_finance_mortgages_user on public.finance_mortgages(user_id, created_at);
create index if not exists idx_finance_scenarios_user on public.finance_scenarios(user_id, is_archived);
create index if not exists idx_finance_scenario_changes_scenario_month on public.finance_scenario_changes(scenario_id, effective_month);

create or replace function public.bump_finance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_finance_profiles_updated_at on public.finance_profiles;
create trigger trg_finance_profiles_updated_at before update on public.finance_profiles for each row execute function public.bump_finance_updated_at();
drop trigger if exists trg_finance_categories_updated_at on public.finance_categories;
create trigger trg_finance_categories_updated_at before update on public.finance_categories for each row execute function public.bump_finance_updated_at();
drop trigger if exists trg_finance_budget_items_updated_at on public.finance_budget_items;
create trigger trg_finance_budget_items_updated_at before update on public.finance_budget_items for each row execute function public.bump_finance_updated_at();
drop trigger if exists trg_finance_actual_entries_updated_at on public.finance_actual_entries;
create trigger trg_finance_actual_entries_updated_at before update on public.finance_actual_entries for each row execute function public.bump_finance_updated_at();
drop trigger if exists trg_finance_balance_snapshots_updated_at on public.finance_balance_snapshots;
create trigger trg_finance_balance_snapshots_updated_at before update on public.finance_balance_snapshots for each row execute function public.bump_finance_updated_at();
drop trigger if exists trg_finance_goals_updated_at on public.finance_goals;
create trigger trg_finance_goals_updated_at before update on public.finance_goals for each row execute function public.bump_finance_updated_at();
drop trigger if exists trg_finance_mortgages_updated_at on public.finance_mortgages;
create trigger trg_finance_mortgages_updated_at before update on public.finance_mortgages for each row execute function public.bump_finance_updated_at();
drop trigger if exists trg_finance_scenarios_updated_at on public.finance_scenarios;
create trigger trg_finance_scenarios_updated_at before update on public.finance_scenarios for each row execute function public.bump_finance_updated_at();
drop trigger if exists trg_finance_scenario_changes_updated_at on public.finance_scenario_changes;
create trigger trg_finance_scenario_changes_updated_at before update on public.finance_scenario_changes for each row execute function public.bump_finance_updated_at();

alter table public.finance_profiles enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_budget_items enable row level security;
alter table public.finance_actual_entries enable row level security;
alter table public.finance_balance_snapshots enable row level security;
alter table public.finance_goals enable row level security;
alter table public.finance_mortgages enable row level security;
alter table public.finance_scenarios enable row level security;
alter table public.finance_scenario_changes enable row level security;

drop policy if exists finance_profiles_access on public.finance_profiles;
create policy finance_profiles_access on public.finance_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists finance_categories_access on public.finance_categories;
create policy finance_categories_access on public.finance_categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists finance_budget_items_access on public.finance_budget_items;
create policy finance_budget_items_access on public.finance_budget_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists finance_actual_entries_access on public.finance_actual_entries;
create policy finance_actual_entries_access on public.finance_actual_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists finance_balance_snapshots_access on public.finance_balance_snapshots;
create policy finance_balance_snapshots_access on public.finance_balance_snapshots for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists finance_goals_access on public.finance_goals;
create policy finance_goals_access on public.finance_goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists finance_mortgages_access on public.finance_mortgages;
create policy finance_mortgages_access on public.finance_mortgages for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists finance_scenarios_access on public.finance_scenarios;
create policy finance_scenarios_access on public.finance_scenarios for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists finance_scenario_changes_access on public.finance_scenario_changes;
create policy finance_scenario_changes_access on public.finance_scenario_changes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

commit;
