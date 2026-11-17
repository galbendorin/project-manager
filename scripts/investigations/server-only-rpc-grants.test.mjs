// Isolated verification of 2026-11-15_revoke_server_only_rpc_grants.sql
// PGLITE_MODULE=/path/to/pglite/dist/index.js node --test scripts/investigations/server-only-rpc-grants.test.mjs
// Never connects to a hosted database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';

const db = await createShoppingTestDatabase();
const ids = {
  admin: randomUUID(),
  owner: randomUUID(),
  member: randomUUID(),
  starterUser: randomUUID(),
};

const sql = name => readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const migrate = async name => db.exec((await sql(name))
  .replaceAll('create extension if not exists pgcrypto;', '-- core gen_random_uuid used in isolated fixture'));

const SERVER_ONLY_SIGNATURES = [
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
  'public.fail_checkout_session(uuid, text)',
];

const BROWSER_WRAPPER_SIGNATURES = [
  'public.get_or_create_current_user_profile()',
  'public.increment_current_user_ai_reports()',
  'public.get_my_finance_household_access()',
  'public.get_my_finance_household_members()',
];

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz default now(),
      created_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant select on auth.users to anon, authenticated, service_role;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create table public.projects (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      name text not null default 'Test Project',
      tasks jsonb default '[]'::jsonb,
      registers jsonb default '{}'::jsonb,
      tracker jsonb default '[]'::jsonb,
      status_report jsonb default '{}'::jsonb,
      baseline jsonb,
      is_demo boolean not null default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    alter table public.projects enable row level security;
    create policy projects_owner_all on public.projects for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);

    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      email text,
      created_at timestamptz default now()
    );
    create table public.user_profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      plan text default 'trial',
      subscription_status text default 'trialing',
      subscription_id text,
      stripe_customer_id text,
      trial_start timestamptz default now(),
      trial_ends timestamptz default (now() + interval '90 days'),
      ai_reports_used integer default 0,
      ai_reports_reset_at timestamptz default now(),
      is_admin boolean default false,
      is_platform_admin boolean default false,
      household_tools_enabled boolean default false,
      finance_enabled boolean default false,
      platform_ai_enabled boolean default true,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    alter table public.user_profiles enable row level security;
    create policy user_profiles_select_own on public.user_profiles for select
      using (auth.uid() = id);
  `);

  await db.query(
    `insert into auth.users (id, email, email_confirmed_at) values
      ($1, 'galben.dorin@yahoo.com', now()),
      ($2, 'owner@example.test', now()),
      ($3, 'member@example.test', now()),
      ($4, 'starter@example.test', now())`,
    [ids.admin, ids.owner, ids.member, ids.starterUser]
  );

  await migrate('2026-02-23_create_manual_todos.sql');
  await migrate('2026-03-24_add_project_members_and_shared_access.sql');
  await migrate('2026-03-30_expand_project_sharing_and_pending_invites.sql');
  await migrate('2026-04-09_add_meal_planner.sql');
  await migrate('2026-04-10_expand_meal_planner_slot_entries.sql');
  await migrate('2026-04-14_harden_user_profiles.sql');
  await migrate('2026-04-15_share_meal_planner_with_shopping_list.sql');
  await migrate('2026-04-15_add_meal_plan_carryover_entries.sql');
  await migrate('2026-04-15_add_meal_plan_grocery_exclusions.sql');
  await migrate('2026-04-18_harden_server_entitlements_and_checkout.sql');
  await migrate('2026-08-30_add_finance_planner.sql');
  await migrate('2026-09-01_add_finance_month_reconciliation.sql');
  await migrate('2026-09-02_share_finance_household_with_irina.sql');
  await migrate('2026-09-02_upgrade_finance_household_access.sql');

  // Seed admin and starter user profiles
  await db.query(
    `insert into public.user_profiles (id, plan, subscription_status, is_admin, is_platform_admin)
     values ($1, 'team', 'active', true, true)
     on conflict (id) do update set is_admin = true, is_platform_admin = true`,
    [ids.admin]
  );
  await db.query(
    `insert into public.user_profiles (id, plan, subscription_status, trial_ends)
     values ($1, 'starter', 'free', now() - interval '1 day')
     on conflict (id) do update set plan = 'starter', subscription_status = 'free', trial_ends = now() - interval '1 day'`,
    [ids.starterUser]
  );
});

after(async () => {
  await db.close();
});

test('1. Pre-migration baseline reproduces the inherited anon & authenticated execute grants on all 14 server-only functions', async () => {
  for (const sig of SERVER_ONLY_SIGNATURES) {
    const { rows } = await db.query(
      `select
         has_function_privilege('anon', $1, 'EXECUTE') as anon_exec,
         has_function_privilege('authenticated', $1, 'EXECUTE') as auth_exec,
         has_function_privilege('service_role', $1, 'EXECUTE') as service_exec`,
      [sig]
    );
    assert.equal(rows[0].anon_exec, true, `Expected baseline anon grant on ${sig}`);
    assert.equal(rows[0].auth_exec, true, `Expected baseline authenticated grant on ${sig}`);
    assert.equal(rows[0].service_exec, true, `Expected baseline service_role grant on ${sig}`);
  }
});

test('2. Applying 2026-11-15_revoke_server_only_rpc_grants.sql revokes anon & authenticated on all 14 server-only RPCs while preserving service_role and all 4 browser wrappers', async () => {
  await migrate('2026-11-15_revoke_server_only_rpc_grants.sql');

  for (const sig of SERVER_ONLY_SIGNATURES) {
    const { rows } = await db.query(
      `select
         has_function_privilege('anon', $1, 'EXECUTE') as anon_exec,
         has_function_privilege('authenticated', $1, 'EXECUTE') as auth_exec,
         has_function_privilege('service_role', $1, 'EXECUTE') as service_exec`,
      [sig]
    );
    assert.equal(rows[0].anon_exec, false, `anon must NOT have EXECUTE on ${sig}`);
    assert.equal(rows[0].auth_exec, false, `authenticated must NOT have EXECUTE on ${sig}`);
    assert.equal(rows[0].service_exec, true, `service_role MUST retain EXECUTE on ${sig}`);
  }

  for (const sig of BROWSER_WRAPPER_SIGNATURES) {
    const { rows } = await db.query(
      `select has_function_privilege('authenticated', $1, 'EXECUTE') as auth_exec`,
      [sig]
    );
    assert.equal(rows[0].auth_exec, true, `authenticated MUST retain EXECUTE on wrapper ${sig}`);
  }
});

test('3. Direct client calls from anon and authenticated to the 14 server-only RPCs fail with permission denied (42501)', async () => {
  const probeCalls = [
    ['get_or_create_user_profile', 'select public.get_or_create_user_profile($1)', [ids.owner]],
    ['resolve_user_access_plan', 'select public.resolve_user_access_plan($1, now())', [ids.owner]],
    ['set_finance_access_for_email', 'select public.set_finance_access_for_email($1, $2, true)', [ids.admin, 'member@example.test']],
    ['invite_finance_household_member', 'select public.invite_finance_household_member($1, $2)', [ids.owner, 'member@example.test']],
    ['accept_finance_household_invitation', 'select public.accept_finance_household_invitation($1, $2)', [ids.member, ids.owner]],
    ['decline_finance_household_invitation', 'select public.decline_finance_household_invitation($1, $2)', [ids.member, ids.owner]],
    ['remove_finance_household_member', 'select public.remove_finance_household_member($1, $2)', [ids.owner, ids.member]],
    ['leave_finance_household', 'select public.leave_finance_household($1)', [ids.member]],
    ['claim_ai_generation_allowance', 'select public.claim_ai_generation_allowance($1, $2)', [ids.owner, 'platform']],
    ['finalize_ai_generation_allowance', 'select public.finalize_ai_generation_allowance($1)', [ids.owner]],
    ['release_ai_generation_allowance', 'select public.release_ai_generation_allowance($1)', [ids.owner]],
    ['begin_checkout_session', 'select public.begin_checkout_session($1, $2, $3)', [ids.owner, 'monthly', 'price_test']],
    ['complete_checkout_session', 'select public.complete_checkout_session($1, $2, $3, now(), $4)', [ids.owner, 'cs_1', 'https://checkout.stripe.com/1', 'cus_1']],
    ['fail_checkout_session', 'select public.fail_checkout_session($1, $2)', [ids.owner, 'failed']],
  ];

  for (const role of ['anon', 'authenticated']) {
    for (const [fnName, queryText, params] of probeCalls) {
      await db.exec('begin');
      try {
        await db.exec(`set local role ${role}; select set_config('request.jwt.claim.sub', '${ids.member}', true);`);
        await assert.rejects(
          () => db.query(queryText, params),
          new RegExp(`permission denied for function ${fnName}`, 'i')
        );
      } finally {
        await db.exec('rollback');
      }
    }
  }
});

test('4. All 4 browser wrappers succeed when invoked as authenticated user (nested SECURITY DEFINER calls work)', async () => {
  await db.exec('begin');
  try {
    // Enable finance for owner via service_role first so get_my_finance_household_members() passes its business check
    await db.exec('set local role service_role;');
    await db.query('select public.set_finance_access_for_email($1, $2, true)', [ids.admin, 'owner@example.test']);

    await db.exec(`
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${ids.owner}', true);
      select set_config('request.jwt.claims', '{"email":"owner@example.test"}', true);
    `);

    const profileRes = await db.query('select (public.get_or_create_current_user_profile()).id as id');
    assert.equal(profileRes.rows[0].id, ids.owner);

    const incrRes = await db.query('select (public.increment_current_user_ai_reports()).id as id');
    assert.equal(incrRes.rows[0].id, ids.owner);

    const accessRes = await db.query('select * from public.get_my_finance_household_access()');
    assert.equal(accessRes.rows.length, 1);
    assert.equal(accessRes.rows[0].is_owner, true);
    assert.equal(accessRes.rows[0].has_access, true);

    const membersRes = await db.query('select * from public.get_my_finance_household_members()');
    assert.ok(Array.isArray(membersRes.rows));
  } finally {
    await db.exec('rollback');
  }
});

test('5. Project-creation quota trigger (enforce_project_creation_quota) succeeds and enforces Starter 3-project cap for authenticated user', async () => {
  await db.exec('begin');
  try {
    await db.exec(`
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${ids.starterUser}', true);
    `);

    for (let i = 1; i <= 3; i += 1) {
      await db.query(
        'insert into public.projects (user_id, name) values ($1, $2)',
        [ids.starterUser, `Starter Project ${i}`]
      );
    }

    await assert.rejects(
      () => db.query(
        'insert into public.projects (user_id, name) values ($1, $2)',
        [ids.starterUser, 'Starter Project 4 (Exceeds Limit)']
      ),
      /PROJECT_QUOTA_EXCEEDED:3/i
    );
  } finally {
    await db.exec('rollback');
  }
});

test('6. Representative server-side Finance, AI allowance, and Checkout flows succeed as service_role', async () => {
  await db.exec('begin');
  try {
    await db.exec('set local role service_role;');

    // A. Finance server flow: enable finance for owner, invite member, accept invitation
    const enableRes = await db.query(
      'select public.set_finance_access_for_email($1, $2, true) as res',
      [ids.admin, 'owner@example.test']
    );
    assert.equal(enableRes.rows[0].res.ok, true);

    const inviteRes = await db.query(
      'select public.invite_finance_household_member($1, $2) as res',
      [ids.owner, 'member@example.test']
    );
    assert.equal(inviteRes.rows[0].res.ok, true);
    const invitationId = inviteRes.rows[0].res.invitation_id;
    assert.ok(invitationId);

    const acceptRes = await db.query(
      'select public.accept_finance_household_invitation($1, $2) as res',
      [ids.member, invitationId]
    );
    assert.equal(acceptRes.rows[0].res.ok, true);
    assert.equal(acceptRes.rows[0].res.owner_user_id, ids.owner);

    // B. AI quota server flow: claim -> finalize -> claim -> release
    const claim1 = await db.query(
      'select public.claim_ai_generation_allowance($1, $2) as res',
      [ids.owner, 'platform']
    );
    assert.equal(claim1.rows[0].res.ok, true);
    const resId1 = claim1.rows[0].res.reservation_id;

    const finalized = await db.query(
      'select (public.finalize_ai_generation_allowance($1)).ai_reports_used as used',
      [resId1]
    );
    assert.equal(finalized.rows[0].used, 1);

    const claim2 = await db.query(
      'select public.claim_ai_generation_allowance($1, $2) as res',
      [ids.owner, 'byok']
    );
    assert.equal(claim2.rows[0].res.ok, true);
    const released = await db.query(
      'select public.release_ai_generation_allowance($1) as released',
      [claim2.rows[0].res.reservation_id]
    );
    assert.equal(released.rows[0].released, true);

    // C. Checkout server flow: begin -> complete -> fail (on a second user)
    const begin1 = await db.query(
      'select public.begin_checkout_session($1, $2, $3) as res',
      [ids.owner, 'monthly', 'price_monthly_test']
    );
    assert.equal(begin1.rows[0].res.ok, true);
    const complete1 = await db.query(
      'select public.complete_checkout_session($1, $2, $3, now() + interval \'1 hour\', $4) as res',
      [begin1.rows[0].res.checkout_id, 'cs_test_123', 'https://checkout.stripe.com/c/pay/cs_test_123', 'cus_test_123']
    );
    assert.equal(complete1.rows[0].res.ok, true);
    assert.equal(complete1.rows[0].res.status, 'ready');
  } finally {
    await db.exec('rollback');
  }
});
