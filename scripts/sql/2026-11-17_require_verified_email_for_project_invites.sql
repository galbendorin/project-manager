-- Phase 2 hardening for public.invite_project_member:
-- Prevent direct project_members grant when a matching profile belongs to an
-- unverified auth.users account (email_confirmed_at is null). Unverified accounts
-- receive a pending project_member_invites row and must confirm email before
-- /api/project-members-accept-pending promotes them.

begin;

create or replace function public.invite_project_member(
  target_project_id uuid,
  invite_email text,
  invited_by_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(coalesce(invite_email, '')));
  owner_email text;
  existing_profile_id uuid;
  seat_limit integer := public.project_collaborator_seat_limit();
  slot_count integer := 0;
begin
  if target_project_id is null or invited_by_user_id is null or normalized_email = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_request'
    );
  end if;

  if public.project_owner_id(target_project_id) is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'project_not_found'
    );
  end if;

  if public.project_owner_id(target_project_id) <> invited_by_user_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'forbidden'
    );
  end if;

  select lower(btrim(email))
  into owner_email
  from public.profiles
  where id = invited_by_user_id
  limit 1;

  if owner_email = normalized_email then
    return jsonb_build_object(
      'ok', false,
      'code', 'owner_email'
    );
  end if;

  if exists (
    select 1
    from public.project_members
    where project_id = target_project_id
      and member_email = normalized_email
  ) then
    return jsonb_build_object(
      'ok', true,
      'delivery', 'existing-access'
    );
  end if;

  if exists (
    select 1
    from public.project_member_invites
    where project_id = target_project_id
      and member_email = normalized_email
      and accepted_at is null
      and revoked_at is null
  ) then
    return jsonb_build_object(
      'ok', true,
      'delivery', 'pending-access'
    );
  end if;

  select count(*)
  into slot_count
  from public.project_members pm
  where pm.project_id = target_project_id;

  slot_count := slot_count + (
    select count(*)
    from public.project_member_invites pmi
    where pmi.project_id = target_project_id
      and pmi.accepted_at is null
      and pmi.revoked_at is null
  );

  if slot_count >= seat_limit then
    return jsonb_build_object(
      'ok', false,
      'code', 'seat_cap_exceeded',
      'limit', seat_limit
    );
  end if;

  select p.id
  into existing_profile_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(btrim(p.email)) = normalized_email
    and lower(btrim(coalesce(u.email, p.email))) = normalized_email
    and u.email_confirmed_at is not null
  order by p.created_at asc nulls last, p.id asc
  limit 1;

  if existing_profile_id = invited_by_user_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'owner_email'
    );
  end if;

  if existing_profile_id is not null then
    begin
      insert into public.project_members (
        project_id,
        user_id,
        member_email,
        role,
        invited_by_user_id
      ) values (
        target_project_id,
        existing_profile_id,
        normalized_email,
        'editor',
        invited_by_user_id
      );
    exception
      when unique_violation then
        return jsonb_build_object(
          'ok', true,
          'delivery', 'existing-access'
        );
      when others then
        if position('PROJECT_COLLABORATOR_SEAT_CAP_EXCEEDED:' in sqlerrm) = 1 then
          return jsonb_build_object(
            'ok', false,
            'code', 'seat_cap_exceeded',
            'limit', seat_limit
          );
        end if;
        raise;
    end;

    return jsonb_build_object(
      'ok', true,
      'delivery', 'existing-account'
    );
  end if;

  begin
    insert into public.project_member_invites (
      project_id,
      member_email,
      role,
      invited_by_user_id
    ) values (
      target_project_id,
      normalized_email,
      'editor',
      invited_by_user_id
    );
  exception
    when unique_violation then
      return jsonb_build_object(
        'ok', true,
        'delivery', 'pending-access'
      );
    when others then
      if position('PROJECT_COLLABORATOR_SEAT_CAP_EXCEEDED:' in sqlerrm) = 1 then
        return jsonb_build_object(
          'ok', false,
          'code', 'seat_cap_exceeded',
          'limit', seat_limit
        );
      end if;
      raise;
  end;

  return jsonb_build_object(
    'ok', true,
    'delivery', 'pending-signup'
  );
end;
$$;

revoke all on function public.invite_project_member(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.invite_project_member(uuid, text, uuid) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.invite_project_member(uuid, text, uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.invite_project_member(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'INVITE_PROJECT_MEMBER_CLIENT_GRANT_STILL_PRESENT';
  end if;

  if not has_function_privilege('service_role', 'public.invite_project_member(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'INVITE_PROJECT_MEMBER_SERVICE_ROLE_GRANT_MISSING';
  end if;
end $$;

commit;
