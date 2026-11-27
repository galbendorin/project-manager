begin;

-- Pre-flight check: verify all 14 server-only RPCs, 4 browser wrappers, and
-- trigger/helper functions exist and share the same owner before changing grants.
do $$
declare
  fn_sig text;
  expected_owner oid;
  proc_oid regprocedure;
  proc_owner oid;
  proc_secdef boolean;
  server_only_functions constant text[] := array[
    'public.set_finance_access_for_email(uuid, text, boolean)',
    'public.invite_finance_household_member(uuid, text)',
    'public.accept_finance_household_invitation(uuid, uuid)',
    'public.decline_finance_household_invitation(uuid, uuid)',
    'public.remove_finance_household_member(uuid, uuid)',
    'public.leave_finance_household(uuid)',
    'public.get_or_create_user_profile(uuid)',
    'public.resolve_user_access_plan(uuid, timestamptz)',
    'public.claim_ai_generation_allowance(uuid, text)',
    'public.finalize_ai_generation_allowance(uuid)',
    'public.release_ai_generation_allowance(uuid)',
    'public.begin_checkout_session(uuid, text, text)',
    'public.complete_checkout_session(uuid, text, text, timestamptz, text)',
    'public.fail_checkout_session(uuid, text)'
  ];
  browser_wrappers constant text[] := array[
    'public.get_or_create_current_user_profile()',
    'public.increment_current_user_ai_reports()',
    'public.get_my_finance_household_access()',
    'public.get_my_finance_household_members()'
  ];
  dependent_triggers constant text[] := array[
    'public.enforce_project_creation_quota()',
    'public.enforce_project_task_limit_and_household_name_guard()',
    'public.enforce_project_collaborator_seat_cap()'
  ];
begin
  select proowner
  into expected_owner
  from pg_proc
  where oid = to_regprocedure('public.get_or_create_user_profile(uuid)');

  if expected_owner is null then
    raise exception 'RPC_HARDEN_MISSING_BASE_FUNCTION: public.get_or_create_user_profile(uuid)';
  end if;

  foreach fn_sig in array server_only_functions || browser_wrappers || dependent_triggers loop
    proc_oid := to_regprocedure(fn_sig);
    if proc_oid is null then
      raise exception 'RPC_HARDEN_MISSING_FUNCTION: %', fn_sig;
    end if;

    select proowner, prosecdef
    into proc_owner, proc_secdef
    from pg_proc
    where oid = proc_oid;

    if not proc_secdef then
      raise exception 'RPC_HARDEN_NOT_SECURITY_DEFINER: %', fn_sig;
    end if;

    if proc_owner <> expected_owner then
      raise exception 'RPC_HARDEN_OWNER_MISMATCH on %', fn_sig;
    end if;
  end loop;
end
$$;

-- 1. Finance Household Server-Only RPCs (called only by api/finance-access.js via service_role)
revoke all on function public.set_finance_access_for_email(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_finance_access_for_email(uuid, text, boolean) to service_role;

revoke all on function public.invite_finance_household_member(uuid, text) from public, anon, authenticated;
grant execute on function public.invite_finance_household_member(uuid, text) to service_role;

revoke all on function public.accept_finance_household_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_finance_household_invitation(uuid, uuid) to service_role;

revoke all on function public.decline_finance_household_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.decline_finance_household_invitation(uuid, uuid) to service_role;

revoke all on function public.remove_finance_household_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_finance_household_member(uuid, uuid) to service_role;

revoke all on function public.leave_finance_household(uuid) from public, anon, authenticated;
grant execute on function public.leave_finance_household(uuid) to service_role;

-- 2. Billing, Profile & AI Quota Server-Only RPCs (called only by api/ai-generate.js, api/create-checkout-session.js, or internal SECURITY DEFINER functions)
revoke all on function public.get_or_create_user_profile(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_user_profile(uuid) to service_role;

revoke all on function public.resolve_user_access_plan(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_user_access_plan(uuid, timestamptz) to service_role;

revoke all on function public.claim_ai_generation_allowance(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_ai_generation_allowance(uuid, text) to service_role;

revoke all on function public.finalize_ai_generation_allowance(uuid) from public, anon, authenticated;
grant execute on function public.finalize_ai_generation_allowance(uuid) to service_role;

revoke all on function public.release_ai_generation_allowance(uuid) from public, anon, authenticated;
grant execute on function public.release_ai_generation_allowance(uuid) to service_role;

revoke all on function public.begin_checkout_session(uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_checkout_session(uuid, text, text) to service_role;

revoke all on function public.complete_checkout_session(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.complete_checkout_session(uuid, text, text, timestamptz, text) to service_role;

revoke all on function public.fail_checkout_session(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_checkout_session(uuid, text) to service_role;

-- 3. Automated Post-Condition Assertions (aborts transaction if any server-only grant leaked or any wrapper lost access)
do $$
declare
  fn_sig text;
  server_only_functions constant text[] := array[
    'public.set_finance_access_for_email(uuid, text, boolean)',
    'public.invite_finance_household_member(uuid, text)',
    'public.accept_finance_household_invitation(uuid, uuid)',
    'public.decline_finance_household_invitation(uuid, uuid)',
    'public.remove_finance_household_member(uuid, uuid)',
    'public.leave_finance_household(uuid)',
    'public.get_or_create_user_profile(uuid)',
    'public.resolve_user_access_plan(uuid, timestamptz)',
    'public.claim_ai_generation_allowance(uuid, text)',
    'public.finalize_ai_generation_allowance(uuid)',
    'public.release_ai_generation_allowance(uuid)',
    'public.begin_checkout_session(uuid, text, text)',
    'public.complete_checkout_session(uuid, text, text, timestamptz, text)',
    'public.fail_checkout_session(uuid, text)'
  ];
  browser_wrappers constant text[] := array[
    'public.get_or_create_current_user_profile()',
    'public.increment_current_user_ai_reports()',
    'public.get_my_finance_household_access()',
    'public.get_my_finance_household_members()'
  ];
begin
  foreach fn_sig in array server_only_functions loop
    if has_function_privilege('anon', fn_sig, 'EXECUTE')
      or has_function_privilege('authenticated', fn_sig, 'EXECUTE') then
      raise exception 'UNEXPECTED_CLIENT_RPC_GRANT on %: no changes applied', fn_sig;
    end if;

    if not has_function_privilege('service_role', fn_sig, 'EXECUTE') then
      raise exception 'MISSING_SERVICE_ROLE_RPC_GRANT on %: no changes applied', fn_sig;
    end if;
  end loop;

  foreach fn_sig in array browser_wrappers loop
    if not has_function_privilege('authenticated', fn_sig, 'EXECUTE') then
      raise exception 'MISSING_AUTHENTICATED_WRAPPER_GRANT on %: no changes applied', fn_sig;
    end if;
  end loop;
end
$$;

commit;
