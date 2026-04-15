begin;

alter table public.meal_library_meals
  add column if not exists shopping_project_id uuid null references public.projects(id) on delete cascade;

alter table public.meal_plan_weeks
  add column if not exists shopping_project_id uuid null references public.projects(id) on delete cascade;

update public.meal_plan_weeks weeks
set shopping_project_id = coalesce(
  (
    select batches.shopping_project_id
    from public.meal_plan_grocery_batches batches
    where batches.week_id = weeks.id
    limit 1
  ),
  (
    select projects.id
    from public.projects projects
    where projects.user_id = weeks.user_id
      and projects.name = 'Shopping List'
    order by projects.created_at asc
    limit 1
  )
)
where weeks.shopping_project_id is null;

update public.meal_library_meals meals
set shopping_project_id = coalesce(
  (
    select weeks.shopping_project_id
    from public.meal_plan_entries entries
    join public.meal_plan_weeks weeks
      on weeks.id = entries.week_id
    where entries.meal_id = meals.id
      and weeks.shopping_project_id is not null
    order by weeks.created_at asc
    limit 1
  ),
  (
    select projects.id
    from public.projects projects
    where projects.user_id = meals.user_id
      and projects.name = 'Shopping List'
    order by projects.created_at asc
    limit 1
  )
)
where meals.shopping_project_id is null;

drop index if exists public.idx_meal_library_meals_user_external;

create unique index if not exists idx_meal_library_meals_project_external
  on public.meal_library_meals(shopping_project_id, external_id)
  where shopping_project_id is not null
    and external_id is not null;

create unique index if not exists idx_meal_library_meals_legacy_user_external
  on public.meal_library_meals(user_id, external_id)
  where shopping_project_id is null
    and external_id is not null;

create index if not exists idx_meal_library_meals_project_slot
  on public.meal_library_meals(shopping_project_id, meal_slot, created_at desc)
  where shopping_project_id is not null;

alter table public.meal_plan_weeks
  drop constraint if exists meal_plan_weeks_user_id_week_start_date_key;

create unique index if not exists idx_meal_plan_weeks_project_week
  on public.meal_plan_weeks(shopping_project_id, week_start_date)
  where shopping_project_id is not null;

create unique index if not exists idx_meal_plan_weeks_legacy_user_week
  on public.meal_plan_weeks(user_id, week_start_date)
  where shopping_project_id is null;

create index if not exists idx_meal_plan_weeks_project_week_start
  on public.meal_plan_weeks(shopping_project_id, week_start_date desc)
  where shopping_project_id is not null;

drop policy if exists "meal_library_meals_select_own" on public.meal_library_meals;
drop policy if exists "meal_library_meals_insert_own" on public.meal_library_meals;
drop policy if exists "meal_library_meals_update_own" on public.meal_library_meals;
drop policy if exists "meal_library_meals_delete_own" on public.meal_library_meals;

create policy "meal_library_meals_select_shared"
  on public.meal_library_meals
  for select
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_library_meals_insert_shared"
  on public.meal_library_meals
  for insert
  with check (
    auth.uid() = user_id
    and shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_library_meals_update_shared"
  on public.meal_library_meals
  for update
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  )
  with check (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_library_meals_delete_shared"
  on public.meal_library_meals
  for delete
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

drop policy if exists "meal_library_ingredients_select_own" on public.meal_library_ingredients;
drop policy if exists "meal_library_ingredients_insert_own" on public.meal_library_ingredients;
drop policy if exists "meal_library_ingredients_update_own" on public.meal_library_ingredients;
drop policy if exists "meal_library_ingredients_delete_own" on public.meal_library_ingredients;

create policy "meal_library_ingredients_select_shared"
  on public.meal_library_ingredients
  for select
  using (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.shopping_project_id is not null
        and public.can_access_project(meals.shopping_project_id, auth.uid())
    )
  );

create policy "meal_library_ingredients_insert_shared"
  on public.meal_library_ingredients
  for insert
  with check (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.shopping_project_id is not null
        and public.can_access_project(meals.shopping_project_id, auth.uid())
    )
  );

create policy "meal_library_ingredients_update_shared"
  on public.meal_library_ingredients
  for update
  using (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.shopping_project_id is not null
        and public.can_access_project(meals.shopping_project_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.shopping_project_id is not null
        and public.can_access_project(meals.shopping_project_id, auth.uid())
    )
  );

create policy "meal_library_ingredients_delete_shared"
  on public.meal_library_ingredients
  for delete
  using (
    exists (
      select 1
      from public.meal_library_meals meals
      where meals.id = meal_id
        and meals.shopping_project_id is not null
        and public.can_access_project(meals.shopping_project_id, auth.uid())
    )
  );

drop policy if exists "meal_plan_weeks_select_own" on public.meal_plan_weeks;
drop policy if exists "meal_plan_weeks_insert_own" on public.meal_plan_weeks;
drop policy if exists "meal_plan_weeks_update_own" on public.meal_plan_weeks;
drop policy if exists "meal_plan_weeks_delete_own" on public.meal_plan_weeks;

create policy "meal_plan_weeks_select_shared"
  on public.meal_plan_weeks
  for select
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_plan_weeks_insert_shared"
  on public.meal_plan_weeks
  for insert
  with check (
    auth.uid() = user_id
    and shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_plan_weeks_update_shared"
  on public.meal_plan_weeks
  for update
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  )
  with check (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_plan_weeks_delete_shared"
  on public.meal_plan_weeks
  for delete
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

drop policy if exists "meal_plan_entries_select_own" on public.meal_plan_entries;
drop policy if exists "meal_plan_entries_insert_own" on public.meal_plan_entries;
drop policy if exists "meal_plan_entries_update_own" on public.meal_plan_entries;
drop policy if exists "meal_plan_entries_delete_own" on public.meal_plan_entries;

create policy "meal_plan_entries_select_shared"
  on public.meal_plan_entries
  for select
  using (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      where weeks.id = week_id
        and weeks.shopping_project_id is not null
        and public.can_access_project(weeks.shopping_project_id, auth.uid())
    )
  );

create policy "meal_plan_entries_insert_shared"
  on public.meal_plan_entries
  for insert
  with check (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      join public.meal_library_meals meals
        on meals.id = meal_id
      where weeks.id = week_id
        and weeks.shopping_project_id is not null
        and weeks.shopping_project_id = meals.shopping_project_id
        and public.can_access_project(weeks.shopping_project_id, auth.uid())
    )
  );

create policy "meal_plan_entries_update_shared"
  on public.meal_plan_entries
  for update
  using (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      where weeks.id = week_id
        and weeks.shopping_project_id is not null
        and public.can_access_project(weeks.shopping_project_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      join public.meal_library_meals meals
        on meals.id = meal_id
      where weeks.id = week_id
        and weeks.shopping_project_id is not null
        and weeks.shopping_project_id = meals.shopping_project_id
        and public.can_access_project(weeks.shopping_project_id, auth.uid())
    )
  );

create policy "meal_plan_entries_delete_shared"
  on public.meal_plan_entries
  for delete
  using (
    exists (
      select 1
      from public.meal_plan_weeks weeks
      where weeks.id = week_id
        and weeks.shopping_project_id is not null
        and public.can_access_project(weeks.shopping_project_id, auth.uid())
    )
  );

drop policy if exists "meal_plan_grocery_batches_select_own" on public.meal_plan_grocery_batches;
drop policy if exists "meal_plan_grocery_batches_insert_own" on public.meal_plan_grocery_batches;
drop policy if exists "meal_plan_grocery_batches_update_own" on public.meal_plan_grocery_batches;
drop policy if exists "meal_plan_grocery_batches_delete_own" on public.meal_plan_grocery_batches;

create policy "meal_plan_grocery_batches_select_shared"
  on public.meal_plan_grocery_batches
  for select
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_plan_grocery_batches_insert_shared"
  on public.meal_plan_grocery_batches
  for insert
  with check (
    auth.uid() = user_id
    and shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_plan_grocery_batches_update_shared"
  on public.meal_plan_grocery_batches
  for update
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  )
  with check (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

create policy "meal_plan_grocery_batches_delete_shared"
  on public.meal_plan_grocery_batches
  for delete
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

commit;
