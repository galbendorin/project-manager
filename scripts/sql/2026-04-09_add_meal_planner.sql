begin;

create extension if not exists pgcrypto;

create or replace function public.bump_meal_planner_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.meal_library_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text null,
  source_pdf text not null default '',
  suggested_day text null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null default '',
  ingredients_raw text not null default '',
  how_to_make text not null default '',
  estimated_kcal integer null,
  image_ref text not null default '',
  recipe_origin text not null default 'manual' check (recipe_origin in ('manual', 'imported')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_meal_library_meals_user_external
  on public.meal_library_meals(user_id, external_id)
  where external_id is not null;

create index if not exists idx_meal_library_meals_user_slot
  on public.meal_library_meals(user_id, meal_slot, created_at desc);

drop trigger if exists trg_meal_library_meals_updated_at on public.meal_library_meals;
create trigger trg_meal_library_meals_updated_at
before update on public.meal_library_meals
for each row
execute function public.bump_meal_planner_updated_at();

alter table public.meal_library_meals enable row level security;

drop policy if exists "meal_library_meals_select_own" on public.meal_library_meals;
drop policy if exists "meal_library_meals_insert_own" on public.meal_library_meals;
drop policy if exists "meal_library_meals_update_own" on public.meal_library_meals;
drop policy if exists "meal_library_meals_delete_own" on public.meal_library_meals;

create policy "meal_library_meals_select_own"
  on public.meal_library_meals
  for select
  using (auth.uid() = user_id);

create policy "meal_library_meals_insert_own"
  on public.meal_library_meals
  for insert
  with check (auth.uid() = user_id);

create policy "meal_library_meals_update_own"
  on public.meal_library_meals
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "meal_library_meals_delete_own"
  on public.meal_library_meals
  for delete
  using (auth.uid() = user_id);

create table if not exists public.meal_library_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meal_library_meals(id) on delete cascade,
  raw_text text not null default '',
  ingredient_name text not null default '',
  quantity_value double precision null,
  quantity_unit text not null default '',
  notes text not null default '',
  parse_confidence double precision not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_meal_library_ingredients_meal
  on public.meal_library_ingredients(meal_id);

drop trigger if exists trg_meal_library_ingredients_updated_at on public.meal_library_ingredients;
create trigger trg_meal_library_ingredients_updated_at
before update on public.meal_library_ingredients
for each row
execute function public.bump_meal_planner_updated_at();

alter table public.meal_library_ingredients enable row level security;

drop policy if exists "meal_library_ingredients_select_own" on public.meal_library_ingredients;
drop policy if exists "meal_library_ingredients_insert_own" on public.meal_library_ingredients;
drop policy if exists "meal_library_ingredients_update_own" on public.meal_library_ingredients;
drop policy if exists "meal_library_ingredients_delete_own" on public.meal_library_ingredients;

create policy "meal_library_ingredients_select_own"
  on public.meal_library_ingredients
  for select
  using (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.user_id = auth.uid()
    )
  );

create policy "meal_library_ingredients_insert_own"
  on public.meal_library_ingredients
  for insert
  with check (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.user_id = auth.uid()
    )
  );

create policy "meal_library_ingredients_update_own"
  on public.meal_library_ingredients
  for update
  using (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.user_id = auth.uid()
    )
  );

create policy "meal_library_ingredients_delete_own"
  on public.meal_library_ingredients
  for delete
  using (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.user_id = auth.uid()
    )
  );

create table if not exists public.meal_plan_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null,
  adult_count integer not null default 1,
  kid_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, week_start_date)
);

create index if not exists idx_meal_plan_weeks_user_week
  on public.meal_plan_weeks(user_id, week_start_date desc);

drop trigger if exists trg_meal_plan_weeks_updated_at on public.meal_plan_weeks;
create trigger trg_meal_plan_weeks_updated_at
before update on public.meal_plan_weeks
for each row
execute function public.bump_meal_planner_updated_at();

alter table public.meal_plan_weeks enable row level security;

drop policy if exists "meal_plan_weeks_select_own" on public.meal_plan_weeks;
drop policy if exists "meal_plan_weeks_insert_own" on public.meal_plan_weeks;
drop policy if exists "meal_plan_weeks_update_own" on public.meal_plan_weeks;
drop policy if exists "meal_plan_weeks_delete_own" on public.meal_plan_weeks;

create policy "meal_plan_weeks_select_own"
  on public.meal_plan_weeks
  for select
  using (auth.uid() = user_id);

create policy "meal_plan_weeks_insert_own"
  on public.meal_plan_weeks
  for insert
  with check (auth.uid() = user_id);

create policy "meal_plan_weeks_update_own"
  on public.meal_plan_weeks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "meal_plan_weeks_delete_own"
  on public.meal_plan_weeks
  for delete
  using (auth.uid() = user_id);

create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.meal_plan_weeks(id) on delete cascade,
  date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  meal_id uuid not null references public.meal_library_meals(id),
  serving_multiplier double precision null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (week_id, date, meal_slot)
);

create index if not exists idx_meal_plan_entries_week
  on public.meal_plan_entries(week_id, date, meal_slot);

create index if not exists idx_meal_plan_entries_meal
  on public.meal_plan_entries(meal_id);

drop trigger if exists trg_meal_plan_entries_updated_at on public.meal_plan_entries;
create trigger trg_meal_plan_entries_updated_at
before update on public.meal_plan_entries
for each row
execute function public.bump_meal_planner_updated_at();

alter table public.meal_plan_entries enable row level security;

drop policy if exists "meal_plan_entries_select_own" on public.meal_plan_entries;
drop policy if exists "meal_plan_entries_insert_own" on public.meal_plan_entries;
drop policy if exists "meal_plan_entries_update_own" on public.meal_plan_entries;
drop policy if exists "meal_plan_entries_delete_own" on public.meal_plan_entries;

create policy "meal_plan_entries_select_own"
  on public.meal_plan_entries
  for select
  using (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      where weeks.id = week_id
        and weeks.user_id = auth.uid()
    )
  );

create policy "meal_plan_entries_insert_own"
  on public.meal_plan_entries
  for insert
  with check (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      where weeks.id = week_id
        and weeks.user_id = auth.uid()
    )
  );

create policy "meal_plan_entries_update_own"
  on public.meal_plan_entries
  for update
  using (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      where weeks.id = week_id
        and weeks.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      where weeks.id = week_id
        and weeks.user_id = auth.uid()
    )
  );

create policy "meal_plan_entries_delete_own"
  on public.meal_plan_entries
  for delete
  using (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      where weeks.id = week_id
        and weeks.user_id = auth.uid()
    )
  );

create table if not exists public.meal_plan_grocery_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_id uuid not null references public.meal_plan_weeks(id) on delete cascade,
  shopping_project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (week_id)
);

create index if not exists idx_meal_plan_grocery_batches_user_week
  on public.meal_plan_grocery_batches(user_id, week_id);

drop trigger if exists trg_meal_plan_grocery_batches_updated_at on public.meal_plan_grocery_batches;
create trigger trg_meal_plan_grocery_batches_updated_at
before update on public.meal_plan_grocery_batches
for each row
execute function public.bump_meal_planner_updated_at();

alter table public.meal_plan_grocery_batches enable row level security;

drop policy if exists "meal_plan_grocery_batches_select_own" on public.meal_plan_grocery_batches;
drop policy if exists "meal_plan_grocery_batches_insert_own" on public.meal_plan_grocery_batches;
drop policy if exists "meal_plan_grocery_batches_update_own" on public.meal_plan_grocery_batches;
drop policy if exists "meal_plan_grocery_batches_delete_own" on public.meal_plan_grocery_batches;

create policy "meal_plan_grocery_batches_select_own"
  on public.meal_plan_grocery_batches
  for select
  using (auth.uid() = user_id);

create policy "meal_plan_grocery_batches_insert_own"
  on public.meal_plan_grocery_batches
  for insert
  with check (
    auth.uid() = user_id
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_plan_grocery_batches_update_own"
  on public.meal_plan_grocery_batches
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_plan_grocery_batches_delete_own"
  on public.meal_plan_grocery_batches
  for delete
  using (auth.uid() = user_id);

alter table public.manual_todos
  add column if not exists quantity_value double precision null,
  add column if not exists quantity_unit text not null default '',
  add column if not exists source_type text not null default '',
  add column if not exists source_batch_id uuid null references public.meal_plan_grocery_batches(id) on delete set null,
  add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists idx_manual_todos_project_source_batch
  on public.manual_todos(project_id, source_type, source_batch_id);

commit;
