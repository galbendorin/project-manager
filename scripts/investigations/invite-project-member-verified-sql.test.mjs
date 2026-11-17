// Isolated verification of 2026-11-17_require_verified_email_for_project_invites.sql
// PGLITE_MODULE=/path/to/pglite/dist/index.js node --test scripts/investigations/invite-project-member-verified-sql.test.mjs
// Never connects to a hosted database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';

const db = await createShoppingTestDatabase();
const ids = {
  owner: randomUUID(),
  verifiedUser: randomUUID(),
  unverifiedUser: randomUUID(),
  project: randomUUID(),
};

const sql = (name) => readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const migrate = async (name) => db.exec(await sql(name));

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      created_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant select on auth.users to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;

    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      email text,
      created_at timestamptz default now()
    );

    create table public.projects (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      name text not null default 'Test Project'
    );

    create table public.project_members (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.projects(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      member_email text not null,
      role text not null default 'editor',
      invited_by_user_id uuid not null,
      unique (project_id, user_id)
    );

    create table public.project_member_invites (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.projects(id) on delete cascade,
      member_email text not null,
      role text not null default 'editor',
      invited_by_user_id uuid not null,
      accepted_by_user_id uuid,
      accepted_at timestamptz,
      revoked_at timestamptz,
      unique (project_id, member_email)
    );

    create function public.project_owner_id(target_project_id uuid)
    returns uuid language sql stable as $$
      select user_id from public.projects where id = target_project_id
    $$;

    create function public.project_collaborator_seat_limit()
    returns integer language sql stable as $$
      select 5
    $$;
  `);

  await db.query(
    `insert into auth.users (id, email, email_confirmed_at)
     values ($1, 'owner@example.com', now()),
            ($2, 'verified@example.com', now()),
            ($3, 'unverified@example.com', null)`,
    [ids.owner, ids.verifiedUser, ids.unverifiedUser],
  );

  await db.query(
    `insert into public.profiles (id, email)
     values ($1, 'owner@example.com'),
            ($2, 'verified@example.com'),
            ($3, 'unverified@example.com')`,
    [ids.owner, ids.verifiedUser, ids.unverifiedUser],
  );

  await db.query(
    `insert into public.projects (id, user_id, name) values ($1, $2, 'Shared Test')`,
    [ids.project, ids.owner],
  );
});

after(async () => {
  await db.close();
});

test('invite_project_member holds unverified existing accounts as pending-signup instead of granting immediate project_members access', async () => {
  await migrate('2026-11-17_require_verified_email_for_project_invites.sql');

  const unverifiedCall = await db.query(
    `select public.invite_project_member($1, 'unverified@example.com', $2) as result`,
    [ids.project, ids.owner],
  );
  assert.deepEqual(unverifiedCall.rows[0].result, {
    ok: true,
    delivery: 'pending-signup',
  });

  const { rows: unverifiedMemberRows } = await db.query(
    `select * from public.project_members where project_id = $1 and user_id = $2`,
    [ids.project, ids.unverifiedUser],
  );
  assert.equal(unverifiedMemberRows.length, 0);

  const { rows: pendingInviteRows } = await db.query(
    `select member_email from public.project_member_invites where project_id = $1`,
    [ids.project],
  );
  assert.deepEqual(pendingInviteRows.map((r) => r.member_email), ['unverified@example.com']);

  const verifiedCall = await db.query(
    `select public.invite_project_member($1, 'verified@example.com', $2) as result`,
    [ids.project, ids.owner],
  );
  assert.deepEqual(verifiedCall.rows[0].result, {
    ok: true,
    delivery: 'existing-account',
  });

  const { rows: verifiedMemberRows } = await db.query(
    `select user_id from public.project_members where project_id = $1`,
    [ids.project],
  );
  assert.deepEqual(verifiedMemberRows.map((r) => r.user_id), [ids.verifiedUser]);
});

test('anon and authenticated cannot execute invite_project_member directly', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role};`);
      await assert.rejects(
        () => db.query(
          `select public.invite_project_member($1, 'other@example.com', $2)`,
          [ids.project, ids.owner],
        ),
        /permission denied for function invite_project_member/i,
      );
    } finally {
      await db.exec('rollback');
    }
  }
});
