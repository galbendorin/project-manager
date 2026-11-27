// Isolated verification of 2026-11-15_guard_baby_and_habit_child_rls.sql
// PGLITE_MODULE=/path/to/pglite/dist/index.js node --test scripts/investigations/baby-and-habit-child-rls.test.mjs
// Never connects to a hosted database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';

const db = await createShoppingTestDatabase();
const ids = {
  owner: randomUUID(),
  partner: randomUUID(),
  outsider: randomUUID(),
  project: randomUUID(),
  otherProject: randomUUID(),
  baby: randomUUID(),
  outsiderBaby: randomUUID(),
  habit: randomUUID(),
  outsiderHabit: randomUUID(),
};

const sql = name => readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const migrate = async name => db.exec((await sql(name))
  .replaceAll('create extension if not exists pgcrypto;', '-- core gen_random_uuid used in isolated fixture'));

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      created_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant select on auth.users to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

    create table public.projects (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      name text not null default 'Shopping List',
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
  `);

  await db.query(
    `insert into auth.users (id, email) values
      ($1, 'owner@example.test'),
      ($2, 'partner@example.test'),
      ($3, 'outsider@example.test')`,
    [ids.owner, ids.partner, ids.outsider]
  );

  await migrate('2026-02-23_create_manual_todos.sql');
  await migrate('2026-03-24_add_project_members_and_shared_access.sql');
  await migrate('2026-03-30_expand_project_sharing_and_pending_invites.sql');
  await migrate('2026-04-26_add_baby_tracker.sql');
  await migrate('2026-04-26_add_baby_feed_breast_side.sql');
  await migrate('2026-04-29_add_habit_tracker.sql');
  await migrate('2026-04-29_add_habit_reminders.sql');

  // Seed shared household project (Owner + Partner) and outsider project
  await db.query(
    `insert into public.projects (id, user_id, name) values
      ($1, $2, 'Shopping List'),
      ($3, $4, 'Shopping List')`,
    [ids.project, ids.owner, ids.otherProject, ids.outsider]
  );
  await db.query(
    `insert into public.project_members (project_id, user_id, member_email, invited_by_user_id)
     values ($1, $2, 'partner@example.test', $3)`,
    [ids.project, ids.partner, ids.owner]
  );

  // Seed baby profiles and habits
  await db.query(
    `insert into public.baby_profiles (id, user_id, household_project_id, name) values
      ($1, $2, $3, 'Household Baby'),
      ($4, $5, $6, 'Outsider Baby')`,
    [ids.baby, ids.owner, ids.project, ids.outsiderBaby, ids.outsider, ids.otherProject]
  );
  await db.query(
    `insert into public.habit_items (id, user_id, household_project_id, name) values
      ($1, $2, $3, 'Household Habit'),
      ($4, $5, null, 'Outsider Personal Habit')`,
    [ids.habit, ids.owner, ids.project, ids.outsiderHabit, ids.outsider]
  );
});

after(async () => {
  await db.close();
});

test('1. Pre-migration baseline reproduces the cross-tenant child attachment gap and apply migration fixes it', async () => {
  // Before migration: outsider can attach a sleep block to Household Baby by passing household_project_id = null
  await db.exec('begin');
  try {
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.outsider}', true);`);
    await db.query(
      `insert into public.baby_sleep_blocks (baby_id, user_id, household_project_id, sleep_date, block_index, status)
       values ($1, $2, null, '2026-11-15', 0, 'asleep')`,
      [ids.baby, ids.outsider]
    );
  } finally {
    await db.exec('rollback');
  }

  // Apply the hardening migration
  await migrate('2026-11-15_guard_baby_and_habit_child_rls.sql');

  // After migration: outsider cannot attach rows to Household Baby or Household Habit
  for (const [label, queryText] of [
    [
      'baby_sleep_blocks',
      `insert into public.baby_sleep_blocks (baby_id, user_id, household_project_id, sleep_date, block_index, status)
       values ($1, $2, null, '2026-11-15', 0, 'asleep')`,
      [ids.baby, ids.outsider],
    ],
    [
      'baby_feed_entries',
      `insert into public.baby_feed_entries (baby_id, user_id, household_project_id, occurred_at, local_date, duration_minutes)
       values ($1, $2, null, now(), '2026-11-15', 15)`,
      [ids.baby, ids.outsider],
    ],
    [
      'habit_entries',
      `insert into public.habit_entries (habit_id, user_id, household_project_id, entry_date, status)
       values ($1, $2, null, '2026-11-15', 'yes')`,
      [ids.habit, ids.outsider],
    ],
  ]) {
    await db.exec('begin');
    try {
      await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.outsider}', true);`);
      await assert.rejects(
        () => db.query(queryText, [label === 'habit_entries' ? ids.habit : ids.baby, ids.outsider]),
        /row-level security policy/i
      );
    } finally {
      await db.exec('rollback');
    }
  }
});

test('2. Partner B can edit feeds/nappies logged by Partner A, and mixed sleep batch upserts preserve original row authors', async () => {
  await db.exec('begin');
  try {
    // Partner A (owner) logs a feed, a nappy, and sleep block 0 & 1
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.owner}', true);`);
    const feedRes = await db.query(
      `insert into public.baby_feed_entries (baby_id, user_id, household_project_id, occurred_at, local_date, duration_minutes, notes)
       values ($1, $2, $3, now(), '2026-11-15', 20, 'Initial note')
       returning id, user_id`,
      [ids.baby, ids.owner, ids.project]
    );
    const feedId = feedRes.rows[0].id;

    const nappyRes = await db.query(
      `insert into public.baby_nappy_entries (baby_id, user_id, household_project_id, occurred_at, local_date, nappy_type, notes)
       values ($1, $2, $3, now(), '2026-11-15', 'wet', 'Nappy 1')
       returning id`,
      [ids.baby, ids.owner, ids.project]
    );
    const nappyId = nappyRes.rows[0].id;

    await db.query(
      `insert into public.baby_sleep_blocks (baby_id, user_id, household_project_id, sleep_date, block_index, status)
       values ($1, $2, $3, '2026-11-15', 0, 'asleep'), ($1, $2, $3, '2026-11-15', 1, 'awake')`,
      [ids.baby, ids.owner, ids.project]
    );

    // Partner B edits Partner A's feed and nappy (leaving user_id untouched, matching useBabyData.js)
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.partner}', true);`);
    const updatedFeed = await db.query(
      `update public.baby_feed_entries set duration_minutes = 25, notes = 'Partner B updated' where id = $1 returning id, user_id, notes`,
      [feedId]
    );
    assert.equal(updatedFeed.rows.length, 1);
    assert.equal(updatedFeed.rows[0].user_id, ids.owner, 'Original author must be preserved');
    assert.equal(updatedFeed.rows[0].notes, 'Partner B updated');

    const updatedNappy = await db.query(
      `update public.baby_nappy_entries set nappy_type = 'mixed' where id = $1 returning id, user_id, nappy_type`,
      [nappyId]
    );
    assert.equal(updatedNappy.rows.length, 1);
    assert.equal(updatedNappy.rows[0].user_id, ids.owner);

    // Partner B runs a mixed sleep upsert (updating blocks 0 & 1 authored by Partner A, plus inserting new blocks 2 & 3 with user_id = Partner B)
    const upsertedSleep = await db.query(
      `insert into public.baby_sleep_blocks (baby_id, user_id, household_project_id, sleep_date, block_index, status)
       values
         ($1, $2, $3, '2026-11-15', 0, 'awake'),
         ($1, $2, $3, '2026-11-15', 1, 'asleep'),
         ($1, $2, $3, '2026-11-15', 2, 'asleep'),
         ($1, $2, $3, '2026-11-15', 3, 'awake')
       on conflict (baby_id, sleep_date, block_index)
       do update set
         user_id = excluded.user_id,
         household_project_id = excluded.household_project_id,
         status = excluded.status
       returning block_index, status, user_id`,
      [ids.baby, ids.partner, ids.project]
    );
    assert.equal(upsertedSleep.rows.length, 4);
    const byIndex = new Map(upsertedSleep.rows.map(r => [r.block_index, r]));
    assert.equal(byIndex.get(0).status, 'awake');
    assert.equal(byIndex.get(0).user_id, ids.owner, 'Existing block 0 keeps owner as author');
    assert.equal(byIndex.get(1).status, 'asleep');
    assert.equal(byIndex.get(1).user_id, ids.owner, 'Existing block 1 keeps owner as author');
    assert.equal(byIndex.get(2).status, 'asleep');
    assert.equal(byIndex.get(2).user_id, ids.partner, 'New block 2 records partner as author');
  } finally {
    await db.exec('rollback');
  }
});

test('3. Habit journal upsert and toggling a reminder off after its habit is archived both succeed', async () => {
  await db.exec('begin');
  try {
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.owner}', true);`);

    // Create a habit entry via upsert, then partner updates it via upsert
    await db.query(
      `insert into public.habit_entries (habit_id, user_id, household_project_id, entry_date, status, note)
       values ($1, $2, $3, '2026-11-15', 'yes', 'Owner entry')
       on conflict (habit_id, entry_date) do update set status = excluded.status, note = excluded.note`,
      [ids.habit, ids.owner, ids.project]
    );

    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.partner}', true);`);
    const partnerUpsert = await db.query(
      `insert into public.habit_entries (habit_id, user_id, household_project_id, entry_date, status, note)
       values ($1, $2, $3, '2026-11-15', 'skip', 'Partner updated')
       on conflict (habit_id, entry_date) do update set
         user_id = excluded.user_id,
         status = excluded.status,
         note = excluded.note
       returning status, note, user_id`,
      [ids.habit, ids.partner, ids.project]
    );
    assert.equal(partnerUpsert.rows[0].status, 'skip');
    assert.equal(partnerUpsert.rows[0].user_id, ids.owner);

    // Owner creates a reminder linked to the habit, then archives the habit, then toggles reminder is_enabled = false
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.owner}', true);`);
    const remRes = await db.query(
      `insert into public.habit_reminders (user_id, habit_id, household_project_id, title, is_enabled)
       values ($1, $2, $3, 'Evening check', true)
       returning id`,
      [ids.owner, ids.habit, ids.project]
    );
    const reminderId = remRes.rows[0].id;

    await db.query('update public.habit_items set archived_at = now() where id = $1', [ids.habit]);

    const toggled = await db.query(
      'update public.habit_reminders set is_enabled = false where id = $1 returning id, is_enabled',
      [reminderId]
    );
    assert.equal(toggled.rows.length, 1);
    assert.equal(toggled.rows[0].is_enabled, false);
  } finally {
    await db.exec('rollback');
  }
});

test('4. Removed collaborator immediately loses access to both owner-created and collaborator-created shared profiles/habits and child rows', async () => {
  await db.exec('begin');
  try {
    const partnerCreatedSharedBaby = randomUUID();
    const partnerCreatedSharedHabit = randomUUID();

    // Partner creates a shared household baby profile and shared household habit while a member of the household
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.partner}', true);`);
    await db.query(
      `insert into public.baby_profiles (id, user_id, household_project_id, name)
       values ($1, $2, $3, 'Partner-Created Shared Baby')`,
      [partnerCreatedSharedBaby, ids.partner, ids.project]
    );
    await db.query(
      `insert into public.habit_items (id, user_id, household_project_id, name)
       values ($1, $2, $3, 'Partner-Created Shared Habit')`,
      [partnerCreatedSharedHabit, ids.partner, ids.project]
    );

    // Partner logs a feed under Owner's baby and a feed under Partner-Created Shared Baby
    const feedRes = await db.query(
      `insert into public.baby_feed_entries (baby_id, user_id, household_project_id, occurred_at, local_date, duration_minutes)
       values ($1, $2, $3, now(), '2026-11-15', 15)
       returning id`,
      [ids.baby, ids.partner, ids.project]
    );
    const partnerFeedId = feedRes.rows[0].id;

    const sharedBabyFeedRes = await db.query(
      `insert into public.baby_feed_entries (baby_id, user_id, household_project_id, occurred_at, local_date, duration_minutes)
       values ($1, $2, $3, now(), '2026-11-15', 18)
       returning id`,
      [partnerCreatedSharedBaby, ids.partner, ids.project]
    );
    const sharedBabyFeedId = sharedBabyFeedRes.rows[0].id;

    // Owner removes Partner from project_members (executing as project owner under RLS)
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.owner}', true);`);
    const delMember = await db.query(
      'delete from public.project_members where project_id = $1 and user_id = $2 returning id',
      [ids.project, ids.partner]
    );
    assert.equal(delMember.rows.length, 1);

    // Partner can no longer read, update, or delete either the owner-created OR the partner-created shared baby/habit or their child rows
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.partner}', true);`);
    const visibleBabies = await db.query(
      'select id from public.baby_profiles where id = any($1::uuid[])',
      [[ids.baby, partnerCreatedSharedBaby]]
    );
    assert.equal(visibleBabies.rows.length, 0, 'Removed collaborator must lose access to shared baby profiles they created');

    const visibleHabits = await db.query(
      'select id from public.habit_items where id = any($1::uuid[])',
      [[ids.habit, partnerCreatedSharedHabit]]
    );
    assert.equal(visibleHabits.rows.length, 0, 'Removed collaborator must lose access to shared habits they created');

    const visibleFeeds = await db.query(
      'select id from public.baby_feed_entries where id = any($1::uuid[])',
      [[partnerFeedId, sharedBabyFeedId]]
    );
    assert.equal(visibleFeeds.rows.length, 0, 'Removed collaborator must not see child rows of household babies');

    const updated = await db.query('update public.baby_feed_entries set duration_minutes = 99 where id = $1 returning id', [sharedBabyFeedId]);
    assert.equal(updated.rows.length, 0, 'Removed collaborator must not update child rows');

    const deleted = await db.query('delete from public.baby_feed_entries set where id = $1 returning id'.replace(' set', ''), [sharedBabyFeedId]);
    assert.equal(deleted.rows.length, 0, 'Removed collaborator must not delete child rows');

    // Remaining household owner retains full access to the partner-created shared baby and its child rows
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.owner}', true);`);
    const ownerVisibleBabies = await db.query(
      'select id from public.baby_profiles where id = $1',
      [partnerCreatedSharedBaby]
    );
    assert.equal(ownerVisibleBabies.rows.length, 1);
    const ownerVisibleFeeds = await db.query(
      'select id from public.baby_feed_entries where id = $1',
      [sharedBabyFeedId]
    );
    assert.equal(ownerVisibleFeeds.rows.length, 1);
  } finally {
    await db.exec('rollback');
  }
});

test('5. Personal profiles/habits work, parent ownership/household are immutable on UPDATE, and triggers do not leak private parent state', async () => {
  await db.exec('begin');
  try {
    const personalBabyId = randomUUID();
    const personalHabitId = randomUUID();

    // Partner creates a personal baby profile and personal habit (household_project_id = null)
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.partner}', true);`);
    await db.query(
      `insert into public.baby_profiles (id, user_id, household_project_id, name)
       values ($1, $2, null, 'Personal Baby')`,
      [personalBabyId, ids.partner]
    );
    await db.query(
      `insert into public.habit_items (id, user_id, household_project_id, name)
       values ($1, $2, null, 'Personal Habit')`,
      [personalHabitId, ids.partner]
    );

    // Partner can log and read personal child entries
    const personalFeed = await db.query(
      `insert into public.baby_feed_entries (baby_id, user_id, household_project_id, occurred_at, local_date, duration_minutes)
       values ($1, $2, null, now(), '2026-11-15', 12)
       returning id`,
      [personalBabyId, ids.partner]
    );
    assert.equal(personalFeed.rows.length, 1);

    // Parent user_id and household_project_id cannot be mutated on UPDATE
    await db.exec('savepoint sp_immutable_baby');
    await assert.rejects(
      () => db.query('update public.baby_profiles set household_project_id = $1 where id = $2', [ids.project, personalBabyId]),
      /Baby profile ownership and household cannot change/
    );
    await db.exec('rollback to savepoint sp_immutable_baby');

    await db.exec('savepoint sp_immutable_habit');
    await assert.rejects(
      () => db.query('update public.habit_items set household_project_id = $1 where id = $2', [ids.project, personalHabitId]),
      /Habit item ownership and household cannot change/
    );
    await db.exec('rollback to savepoint sp_immutable_habit');

    // Archive Outsider's personal habit and verify that Partner gets the exact same generic RLS error
    // whether probing a missing UUID, an active private parent, or an archived private parent
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.outsider}', true);`);
    await db.query('update public.habit_items set archived_at = now() where id = $1', [ids.outsiderHabit]);

    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${ids.partner}', true);`);
    const missingId = randomUUID();

    let missingErr;
    let privateArchivedErr;
    await db.exec('savepoint sp_missing_entry');
    try {
      await db.query(
        `insert into public.habit_entries (habit_id, user_id, household_project_id, entry_date, status)
         values ($1, $2, null, '2026-11-15', 'yes')`,
        [missingId, ids.partner]
      );
    } catch (err) {
      missingErr = err;
    }
    await db.exec('rollback to savepoint sp_missing_entry');

    await db.exec('savepoint sp_private_entry');
    try {
      await db.query(
        `insert into public.habit_entries (habit_id, user_id, household_project_id, entry_date, status)
         values ($1, $2, null, '2026-11-15', 'yes')`,
        [ids.outsiderHabit, ids.partner]
      );
    } catch (err) {
      privateArchivedErr = err;
    }
    await db.exec('rollback to savepoint sp_private_entry');

    assert.ok(missingErr && privateArchivedErr);
    assert.equal(missingErr.code, '42501');
    assert.equal(privateArchivedErr.code, '42501');
    assert.equal(missingErr.message, privateArchivedErr.message);

    // Also verify re-pointing a reminder to a missing habit vs a private archived habit yields the identical 42501 RLS error
    const remRes = await db.query(
      `insert into public.habit_reminders (user_id, habit_id, household_project_id, title, is_enabled)
       values ($1, $2, null, 'Personal reminder', true)
       returning id`,
      [ids.partner, personalHabitId]
    );
    const remId = remRes.rows[0].id;

    let remMissingErr;
    let remPrivateArchivedErr;
    await db.exec('savepoint sp_missing_rem');
    try {
      await db.query('update public.habit_reminders set habit_id = $1 where id = $2', [missingId, remId]);
    } catch (err) {
      remMissingErr = err;
    }
    await db.exec('rollback to savepoint sp_missing_rem');

    await db.exec('savepoint sp_private_rem');
    try {
      await db.query('update public.habit_reminders set habit_id = $1 where id = $2', [ids.outsiderHabit, remId]);
    } catch (err) {
      remPrivateArchivedErr = err;
    }
    await db.exec('rollback to savepoint sp_private_rem');

    assert.ok(remMissingErr && remPrivateArchivedErr);
    assert.equal(remMissingErr.code, '42501');
    assert.equal(remPrivateArchivedErr.code, '42501');
    assert.equal(remMissingErr.message, remPrivateArchivedErr.message);
  } finally {
    await db.exec('rollback');
  }
});
