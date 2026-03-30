-- Expand shared project access beyond the MVP:
-- - remove the one-collaborator-per-project constraint
-- - add pending email invites for people who have not created accounts yet
-- - keep owner-controlled access management

begin;

drop index if exists public.idx_project_members_one_collaborator_per_project;

create table if not exists public.project_member_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  member_email text not null,
  role text not null default 'editor' check (role in ('editor')),
  invited_by_user_id uuid not null references auth.users(id),
  accepted_by_user_id uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (member_email = lower(btrim(member_email)))
);

create unique index if not exists idx_project_member_invites_pending_email
  on public.project_member_invites(project_id, member_email)
  where accepted_at is null and revoked_at is null;

create index if not exists idx_project_member_invites_project_created
  on public.project_member_invites(project_id, created_at desc);

create index if not exists idx_project_member_invites_email_pending
  on public.project_member_invites(member_email)
  where accepted_at is null and revoked_at is null;

create or replace function public.bump_project_member_invites_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_project_member_invites_updated_at on public.project_member_invites;
create trigger trg_project_member_invites_updated_at
before update on public.project_member_invites
for each row
execute function public.bump_project_member_invites_updated_at();

alter table public.project_member_invites enable row level security;

drop policy if exists "project_member_invites_select_owner" on public.project_member_invites;
drop policy if exists "project_member_invites_insert_owner" on public.project_member_invites;
drop policy if exists "project_member_invites_delete_owner" on public.project_member_invites;

create policy "project_member_invites_select_owner"
  on public.project_member_invites
  for select
  using (public.is_project_owner(project_id, auth.uid()));

create policy "project_member_invites_insert_owner"
  on public.project_member_invites
  for insert
  with check (
    public.is_project_owner(project_id, auth.uid())
    and invited_by_user_id = auth.uid()
    and member_email = lower(btrim(member_email))
  );

create policy "project_member_invites_delete_owner"
  on public.project_member_invites
  for delete
  using (public.is_project_owner(project_id, auth.uid()));

commit;
