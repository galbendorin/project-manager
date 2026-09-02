begin;

create or replace function public.require_identified_finance_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'finalized'
    and old.status <> 'finalized'
    and exists (
      select 1
      from public.finance_month_reconciliation_lines line
      where line.reconciliation_id = new.id
        and line.user_id = new.user_id
        and line.kind in ('unknown_out', 'unknown_in')
    ) then
    raise exception 'Replace every unknown amount with an identified expense, income change, or transfer before finalizing.';
  end if;

  return new;
end;
$$;

revoke all on function public.require_identified_finance_reconciliation() from public;

update public.finance_month_reconciliations reconciliation
set status = 'draft',
    finalized_at = null,
    finalize_token = null,
    version = version + 1
where reconciliation.status = 'finalized'
  and exists (
    select 1
    from public.finance_month_reconciliation_lines line
    where line.reconciliation_id = reconciliation.id
      and line.user_id = reconciliation.user_id
      and line.kind in ('unknown_out', 'unknown_in')
  );

drop trigger if exists trg_require_identified_finance_reconciliation
  on public.finance_month_reconciliations;
create trigger trg_require_identified_finance_reconciliation
before update of status on public.finance_month_reconciliations
for each row execute function public.require_identified_finance_reconciliation();

commit;
