begin;

update public.meal_plan_weeks weeks
set shopping_project_id = (
  select projects.id
  from public.projects projects
  where projects.user_id = weeks.user_id
    and public.normalize_shopping_title(projects.name) = 'shopping list'
  order by projects.created_at asc, projects.id asc
  limit 1
)
where weeks.shopping_project_id is null;

create index if not exists idx_meal_plan_weeks_project_week_visibility
  on public.meal_plan_weeks(shopping_project_id, week_start_date desc)
  where shopping_project_id is not null;

drop policy if exists "meal_plan_weeks_select_shared_visible" on public.meal_plan_weeks;
create policy "meal_plan_weeks_select_shared_visible"
  on public.meal_plan_weeks
  for select
  using (
    shopping_project_id is not null
    and public.can_access_project(shopping_project_id, auth.uid())
  );

drop policy if exists "meal_plan_entries_select_shared_visible" on public.meal_plan_entries;
create policy "meal_plan_entries_select_shared_visible"
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

commit;
