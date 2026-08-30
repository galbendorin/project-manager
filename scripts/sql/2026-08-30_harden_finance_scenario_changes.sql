begin;

create or replace function public.can_access_finance_scenario_change(
  row_user_id uuid,
  row_scenario_id uuid
)
returns boolean
language sql
stable
as $$
  select row_user_id = auth.uid()
    and exists (
      select 1
      from public.finance_scenarios scenario
      where scenario.id = row_scenario_id
        and scenario.user_id = auth.uid()
    );
$$;

drop policy if exists finance_scenario_changes_access on public.finance_scenario_changes;
create policy finance_scenario_changes_access on public.finance_scenario_changes
for all
using (public.can_access_finance_scenario_change(user_id, scenario_id))
with check (public.can_access_finance_scenario_change(user_id, scenario_id));

commit;
