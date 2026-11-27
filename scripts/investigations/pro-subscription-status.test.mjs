// Isolated verification of 2026-11-16_enforce_pro_subscription_status.sql
// PGLITE_MODULE=/path/to/pglite/dist/index.js node --test scripts/investigations/pro-subscription-status.test.mjs
// Never connects to a hosted database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';

const db = await createShoppingTestDatabase();
const ids = {
  user: randomUUID(),
  otherUser: randomUUID(),
  project: randomUUID(),
};

const sql = name => readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const migrate = async name => db.exec((await sql(name))
  .replaceAll('create extension if not exists pgcrypto;', '-- core gen_random_uuid used in isolated fixture'));

const buildTasksJson = count => JSON.stringify(
  Array.from({ length: count }, (_, idx) => ({
    id: `task-${idx + 1}`,
    name: `Task ${idx + 1}`,
  }))
);

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
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
      name text not null,
      tasks jsonb default '[]'::jsonb,
      registers jsonb default '{}'::jsonb,
      tracker jsonb default '[]'::jsonb,
      status_report jsonb default '{}'::jsonb,
      baseline jsonb,
      ishikawa jsonb default '{}'::jsonb,
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
      trial_start timestamptz default now(),
      trial_ends timestamptz default (now() + interval '30 days'),
      stripe_customer_id text,
      subscription_id text,
      current_period_end timestamptz,
      cancel_at_period_end boolean default false,
      ai_reports_used integer default 0,
      ai_reports_reset_at timestamptz default now(),
      is_admin boolean default false,
      household_tools_enabled boolean default false,
      finance_enabled boolean default false,
      platform_ai_enabled boolean default true,
      is_platform_admin boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    alter table public.user_profiles enable row level security;
  `);

  await db.query(
    `insert into auth.users (id, email) values
      ($1, 'galben.dorin@yahoo.com'),
      ($2, 'other-user@example.test')`,
    [ids.user, ids.otherUser]
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
  await migrate('2026-11-15_revoke_server_only_rpc_grants.sql');
});

after(async () => {
  await db.close();
});

test('1. Pre-migration baseline reproduces dead subscription_status fallback and migration fixes it across all statuses', async () => {
  await db.query(
    `insert into public.user_profiles (id, plan, subscription_status, subscription_id, stripe_customer_id)
     values ($1, 'pro', 'unpaid', 'sub_test_1', 'cus_test_1')
     on conflict (id) do update set plan = 'pro', subscription_status = 'unpaid', subscription_id = 'sub_test_1'`,
    [ids.user]
  );

  // Before migration: unpaid pro profile still resolves to 'pro'
  const preRes = await db.query('select public.resolve_user_access_plan($1) as plan', [ids.user]);
  assert.equal(preRes.rows[0].plan, 'pro');

  // Apply the SEC-03 migration
  await migrate('2026-11-16_enforce_pro_subscription_status.sql');

  // Eligible Pro statuses -> 'pro'
  for (const status of ['active', 'trialing', 'past_due', 'ACTIVE', 'Past_Due']) {
    await db.query('update public.user_profiles set plan = $1, subscription_status = $2 where id = $3', ['pro', status, ids.user]);
    const res = await db.query('select public.resolve_user_access_plan($1) as plan', [ids.user]);
    assert.equal(res.rows[0].plan, 'pro', `Expected pro for status=${status}`);
  }

  // Non-eligible Pro statuses -> 'starter'
  for (const status of ['unpaid', 'paused', 'canceled', 'incomplete', 'incomplete_expired', '', 'unknown_status', null]) {
    await db.query('update public.user_profiles set plan = $1, subscription_status = $2 where id = $3', ['pro', status, ids.user]);
    const res = await db.query('select public.resolve_user_access_plan($1) as plan', [ids.user]);
    assert.equal(res.rows[0].plan, 'starter', `Expected starter for status=${String(status)}`);
  }

  // Team, admin, and trial rules remain intact
  await db.query('update public.user_profiles set plan = $1, subscription_status = $2 where id = $3', ['team', 'trialing', ids.user]);
  assert.equal((await db.query('select public.resolve_user_access_plan($1) as plan', [ids.user])).rows[0].plan, 'team');

  await db.query('update public.user_profiles set plan = $1, subscription_status = $2, is_admin = true where id = $3', ['starter', 'canceled', ids.user]);
  assert.equal((await db.query('select public.resolve_user_access_plan($1) as plan', [ids.user])).rows[0].plan, 'team');
  await db.query('update public.user_profiles set is_admin = false where id = $1', [ids.user]);
});

test('2. begin_checkout_session blocks duplicate checkout for unpaid and paused recoverable subscriptions and allows checkout once canceled', async () => {
  await db.exec('begin');
  try {
    await db.exec('set local role service_role');

    for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused']) {
      await db.query(
        `update public.user_profiles
         set plan = 'pro', subscription_status = $1, subscription_id = 'sub_recoverable_1'
         where id = $2`,
        [status, ids.user]
      );

      const res = await db.query(
        'select public.begin_checkout_session($1, $2, $3) as payload',
        [ids.user, 'monthly', 'price_monthly_test']
      );
      assert.equal(res.rows[0].payload.ok, false, `Expected checkout blocked for status=${status}`);
      assert.equal(res.rows[0].payload.code, 'already_subscribed');
    }

    // Once canceled, user can start a new checkout session
    await db.query(
      `update public.user_profiles
       set plan = 'starter', subscription_status = 'canceled', subscription_id = 'sub_recoverable_1'
       where id = $1`,
      [ids.user]
    );
    const allowedRes = await db.query(
      'select public.begin_checkout_session($1, $2, $3) as payload',
      [ids.user, 'monthly', 'price_monthly_test']
    );
    assert.equal(allowedRes.rows[0].payload.ok, true);
    assert.equal(allowedRes.rows[0].payload.reused, false);
    const checkoutId = allowedRes.rows[0].payload.checkout_id;
    assert.ok(checkoutId);

    // Mark checkout session ready with a Stripe URL while initial payment is 'incomplete' on an active app trial
    await db.query(
      `select public.complete_checkout_session($1, 'cs_test_incomplete', 'https://checkout.stripe.com/c/pay/cs_test_incomplete', timezone('utc', now()) + interval '1 hour', 'cus_trial_1')`,
      [checkoutId]
    );
    await db.query(
      `update public.user_profiles
       set plan = 'trial',
           trial_ends = timezone('utc', now()) + interval '15 days',
           subscription_status = 'incomplete',
           subscription_id = 'sub_incomplete_1'
       where id = $1`,
      [ids.user]
    );

    // App trial remains active while subscription_status is 'incomplete'
    const trialPlanRes = await db.query('select public.resolve_user_access_plan($1) as plan', [ids.user]);
    assert.equal(trialPlanRes.rows[0].plan, 'trial');

    // Customer can finish the existing checkout (reuses the ready session URL without creating a second session)
    const reusedRes = await db.query(
      'select public.begin_checkout_session($1, $2, $3) as payload',
      [ids.user, 'monthly', 'price_monthly_test']
    );
    assert.equal(reusedRes.rows[0].payload.ok, true);
    assert.equal(reusedRes.rows[0].payload.reused, true);
    assert.equal(reusedRes.rows[0].payload.checkout_id, checkoutId);
    assert.equal(reusedRes.rows[0].payload.session_url, 'https://checkout.stripe.com/c/pay/cs_test_incomplete');

    // Simulate checkout.session.completed marking the local billing_checkout_sessions row 'completed'
    // while the first subscription is still 'incomplete': begin_checkout_session must block starting a second
    // checkout session ('already_subscribed') so the customer stays on the existing payment recovery path.
    await db.query(
      `update public.billing_checkout_sessions set status = 'completed', updated_at = timezone('utc', now()) where id = $1`,
      [checkoutId]
    );
    const blockedWhileIncompleteRes = await db.query(
      'select public.begin_checkout_session($1, $2, $3) as payload',
      [ids.user, 'monthly', 'price_monthly_test']
    );
    assert.equal(blockedWhileIncompleteRes.rows[0].payload.ok, false);
    assert.equal(blockedWhileIncompleteRes.rows[0].payload.code, 'already_subscribed');

    // Once that initial subscription reaches 'incomplete_expired', app trial is still preserved
    // and the customer is allowed to start a fresh checkout session.
    await db.query(
      `update public.user_profiles set subscription_status = 'incomplete_expired' where id = $1`,
      [ids.user]
    );
    assert.equal((await db.query('select public.resolve_user_access_plan($1) as plan', [ids.user])).rows[0].plan, 'trial');

    const freshAfterExpiredRes = await db.query(
      'select public.begin_checkout_session($1, $2, $3) as payload',
      [ids.user, 'monthly', 'price_monthly_test']
    );
    assert.equal(freshAfterExpiredRes.rows[0].payload.ok, true);
    assert.equal(freshAfterExpiredRes.rows[0].payload.reused, false);
    assert.notEqual(freshAfterExpiredRes.rows[0].payload.checkout_id, checkoutId);
  } finally {
    await db.exec('rollback');
  }
});

test('3. Downgraded or suspended user can edit and delete tasks on an existing >35-task project, cannot grow tasks above cap, and regains Pro cap on recovery', async () => {
  await db.exec('begin');
  try {
    // 1. User starts as active Pro and creates a 50-task project (above Starter's 35-task cap)
    await db.query(
      `update public.user_profiles
       set plan = 'pro', subscription_status = 'active', subscription_id = 'sub_1'
       where id = $1`,
      [ids.user]
    );

    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.user}', true);`);
    await db.query(
      'insert into public.projects (id, user_id, name, tasks) values ($1, $2, $3, $4::jsonb)',
      [ids.project, ids.user, 'Large Pro Project', buildTasksJson(50)]
    );

    // 2. Subscription becomes unpaid (suspended to Starter: task_limit = 35)
    await db.exec('reset role');
    await db.query(
      `update public.user_profiles set subscription_status = 'unpaid' where id = $1`,
      [ids.user]
    );

    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.user}', true);`);

    // Editing tasks / project fields without increasing task count (50 -> 50) succeeds
    const editedSameCount = await db.query(
      'update public.projects set name = $1, tasks = $2::jsonb where id = $3 returning jsonb_array_length(tasks) as count',
      ['Large Pro Project (Edited)', buildTasksJson(50), ids.project]
    );
    assert.equal(editedSameCount.rows[0].count, 50);

    // Deleting a task (50 -> 49, still > 35) succeeds
    const reducedCount = await db.query(
      'update public.projects set tasks = $1::jsonb where id = $2 returning jsonb_array_length(tasks) as count',
      [buildTasksJson(49), ids.project]
    );
    assert.equal(reducedCount.rows[0].count, 49);

    // Adding a task while above the Starter 35-task cap (49 -> 50) is blocked
    await db.exec('savepoint sp_grow_blocked');
    await assert.rejects(
      () => db.query('update public.projects set tasks = $1::jsonb where id = $2', [buildTasksJson(50), ids.project]),
      /PROJECT_TASK_LIMIT_EXCEEDED:35/
    );
    await db.exec('rollback to savepoint sp_grow_blocked');

    // Creating a new project with 36 tasks while suspended is blocked
    await db.exec('savepoint sp_new_project_blocked');
    await assert.rejects(
      () => db.query(
        'insert into public.projects (id, user_id, name, tasks) values ($1, $2, $3, $4::jsonb)',
        [randomUUID(), ids.user, 'Second Large Project', buildTasksJson(36)]
      ),
      /PROJECT_TASK_LIMIT_EXCEEDED:35/
    );
    await db.exec('rollback to savepoint sp_new_project_blocked');

    // 3. Subscription recovers to active -> user can immediately add tasks again (49 -> 55)
    await db.exec('reset role');
    await db.query(
      `update public.user_profiles set subscription_status = 'active' where id = $1`,
      [ids.user]
    );

    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.user}', true);`);
    const grownAfterRecovery = await db.query(
      'update public.projects set tasks = $1::jsonb where id = $2 returning jsonb_array_length(tasks) as count',
      [buildTasksJson(55), ids.project]
    );
    assert.equal(grownAfterRecovery.rows[0].count, 55);
  } finally {
    await db.exec('rollback');
  }
});

test('4. Direct SQL coverage for project-count quota, AI generation allowance, and billing_revision across Pro statuses', async () => {
  await db.exec('begin');
  try {
    // 1. User is active Pro -> can create 4 projects (above Starter's 3-project cap) and claim AI allowance
    const revBefore = (await db.query('select billing_revision from public.user_profiles where id = $1', [ids.user])).rows[0].billing_revision;
    await db.query(
      `update public.user_profiles
       set plan = 'pro', subscription_status = 'active', subscription_id = 'sub_quota_1', ai_reports_used = 0
       where id = $1`,
      [ids.user]
    );
    const revAfter = (await db.query('select billing_revision from public.user_profiles where id = $1', [ids.user])).rows[0].billing_revision;
    assert.ok(Number(revAfter) > Number(revBefore), 'billing_revision must increment on billing update');

    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.user}', true);`);
    for (let i = 1; i <= 4; i += 1) {
      await db.query(
        'insert into public.projects (id, user_id, name, tasks) values ($1, $2, $3, $4::jsonb)',
        [randomUUID(), ids.user, `Pro Project ${i}`, '[]']
      );
    }

    // Active Pro can claim and finalize AI generation allowance via service_role
    await db.exec('set local role service_role');
    const claimActive = await db.query(
      'select public.claim_ai_generation_allowance($1, $2) as payload',
      [ids.user, 'platform']
    );
    assert.equal(claimActive.rows[0].payload.ok, true);
    assert.equal(claimActive.rows[0].payload.effective_plan, 'pro');
    assert.equal(claimActive.rows[0].payload.limit, 100);

    const finalizedProfile = await db.query(
      'select (public.finalize_ai_generation_allowance($1)).ai_reports_used as used',
      [claimActive.rows[0].payload.reservation_id]
    );
    assert.equal(finalizedProfile.rows[0].used, 1);

    // 2. Subscription becomes unpaid or paused -> project creation above 3 is blocked and AI allowance is denied
    for (const suspendedStatus of ['unpaid', 'paused', 'canceled']) {
      await db.query(
        'update public.user_profiles set subscription_status = $1 where id = $2',
        [suspendedStatus, ids.user]
      );

      const claimSuspended = await db.query(
        'select public.claim_ai_generation_allowance($1, $2) as payload',
        [ids.user, 'status_report']
      );
      assert.equal(claimSuspended.rows[0].payload.ok, false, `Expected AI denied for status=${suspendedStatus}`);
      assert.equal(claimSuspended.rows[0].payload.code, 'ai_not_included');
      assert.equal(claimSuspended.rows[0].payload.effective_plan, 'starter');
      assert.equal(claimSuspended.rows[0].payload.remaining, 0);

      await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.user}', true);`);
      await db.exec('savepoint sp_project_quota');
      await assert.rejects(
        () => db.query(
          'insert into public.projects (id, user_id, name, tasks) values ($1, $2, $3, $4::jsonb)',
          [randomUUID(), ids.user, `Blocked Project (${suspendedStatus})`, '[]']
        ),
        /PROJECT_QUOTA_EXCEEDED:3/
      );
      await db.exec('rollback to savepoint sp_project_quota');
      await db.exec('set local role service_role');
    }

    // 3. Recovery to active restores project creation and AI allowance
    await db.query(
      `update public.user_profiles set plan = 'pro', subscription_status = 'active' where id = $1`,
      [ids.user]
    );
    const claimRecovered = await db.query(
      'select public.claim_ai_generation_allowance($1, $2) as payload',
      [ids.user, 'status_report']
    );
    assert.equal(claimRecovered.rows[0].payload.ok, true);
    assert.equal(claimRecovered.rows[0].payload.effective_plan, 'pro');

    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.user}', true);`);
    await db.query(
      'insert into public.projects (id, user_id, name, tasks) values ($1, $2, $3, $4::jsonb)',
      [randomUUID(), ids.user, 'Pro Project 5 After Recovery', '[]']
    );
  } finally {
    await db.exec('rollback');
  }
});
