// Isolated verification of 2026-11-17_harden_push_subscriptions.sql
// PGLITE_MODULE=/path/to/pglite/dist/index.js node --test scripts/investigations/push-subscriptions-rls.test.mjs
// Never connects to a hosted database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';

const db = await createShoppingTestDatabase();
const ids = {
  user1: randomUUID(),
  user2: randomUUID(),
};

const sql = (name) => readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const migrate = async (name) => db.exec(await sql(name));

const runAsRole = async (role, userId, fn) => {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role};`);
    if (userId) {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    }
    const result = await fn();
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
};

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
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
  `);

  await db.query(
    `insert into auth.users (id, email) values ($1, 'u1@example.com'), ($2, 'u2@example.com')`,
    [ids.user1, ids.user2],
  );

  await migrate('2026-04-04_create_push_subscriptions.sql');
});

after(async () => {
  await db.close();
});

test('1. Pre-hardening baseline allowed direct authenticated inserts/selects (and legacy corrupt rows)', async () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/baseline-1';
  const payload = JSON.stringify({
    endpoint,
    keys: { p256dh: 'k1', auth: 'k2' },
  });

  await runAsRole('authenticated', ids.user1, async () => {
    await db.query(
      `insert into public.push_subscriptions (user_id, endpoint, subscription)
       values ($1, $2, $3::jsonb)`,
      [ids.user1, endpoint, payload],
    );
    await db.query(
      `insert into public.push_subscriptions (user_id, endpoint, subscription)
       values ($1, 'http://legacy-insecure.invalid/push', '{"endpoint":"http://legacy-insecure.invalid/push"}'::jsonb),
              ($1, 'https://fcm.googleapis.com/mismatch', '{"endpoint":"https://127.0.0.1/mismatch"}'::jsonb)`,
      [ids.user1],
    );
    const { rows } = await db.query(
      `select endpoint from public.push_subscriptions where user_id = $1`,
      [ids.user1],
    );
    assert.equal(rows.length, 3);
  });
});

test('2. Applying 2026-11-17_harden_push_subscriptions.sql cleans corrupt rows, removes client policies and table grants', async () => {
  await migrate('2026-11-17_harden_push_subscriptions.sql');
  const { rows: surviving } = await runAsRole('service_role', null, () => db.query(
    `select endpoint from public.push_subscriptions`,
  ));
  assert.deepEqual(surviving.map((r) => r.endpoint), ['https://fcm.googleapis.com/fcm/send/baseline-1']);

  for (const role of ['anon', 'authenticated']) {
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const { rows } = await db.query(
        `select has_table_privilege($1, 'public.push_subscriptions', $2) as allowed`,
        [role, priv],
      );
      assert.equal(rows[0].allowed, false, `${role} must not have ${priv} on public.push_subscriptions`);
    }
  }

  for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    const { rows } = await db.query(
      `select has_table_privilege('service_role', 'public.push_subscriptions', $1) as allowed`,
      [priv],
    );
    assert.equal(rows[0].allowed, true, `service_role must retain ${priv}`);
  }
});

test('3. Direct anon and authenticated queries against public.push_subscriptions are denied (42501)', async () => {
  const endpoint = 'https://169.254.169.254/latest/meta-data/';
  const payload = JSON.stringify({
    endpoint,
    keys: { p256dh: 'k1', auth: 'k2' },
  });

  for (const [role, uid] of [['anon', null], ['authenticated', ids.user1], ['authenticated', ids.user2]]) {
    await assert.rejects(
      () => runAsRole(role, uid, () => db.query(`select * from public.push_subscriptions`)),
      /permission denied for table push_subscriptions/i,
    );

    await assert.rejects(
      () => runAsRole(role, uid, () => db.query(
        `insert into public.push_subscriptions (user_id, endpoint, subscription) values ($1, $2, $3::jsonb)`,
        [uid || ids.user1, endpoint, payload],
      )),
      /permission denied for table push_subscriptions/i,
    );

    await assert.rejects(
      () => runAsRole(role, uid, () => db.query(
        `update public.push_subscriptions set is_active = false`,
      )),
      /permission denied for table push_subscriptions/i,
    );

    await assert.rejects(
      () => runAsRole(role, uid, () => db.query(
        `delete from public.push_subscriptions`,
      )),
      /permission denied for table push_subscriptions/i,
    );
  }
});

test('4. service_role retains full CRUD and table constraint rejects non-HTTPS or mismatched endpoints', async () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/service-role-1';
  const payload = JSON.stringify({
    endpoint,
    keys: { p256dh: 'k1', auth: 'k2' },
  });

  await runAsRole('service_role', null, async () => {
    await db.query(
      `insert into public.push_subscriptions (user_id, endpoint, subscription)
       values ($1, $2, $3::jsonb)`,
      [ids.user1, endpoint, payload],
    );

    const { rows: beforeUpdate } = await db.query(
      `select updated_at, is_active from public.push_subscriptions where endpoint = $1`,
      [endpoint],
    );
    assert.equal(beforeUpdate[0].is_active, true);

    await db.query(
      `update public.push_subscriptions set is_active = false where endpoint = $1`,
      [endpoint],
    );

    await db.query(
      `delete from public.push_subscriptions where endpoint = $1`,
      [endpoint],
    );
  });

  await assert.rejects(
    () => runAsRole('service_role', null, () => db.query(
      `insert into public.push_subscriptions (user_id, endpoint, subscription)
       values ($1, 'http://fcm.googleapis.com/insecure', '{"endpoint":"http://fcm.googleapis.com/insecure"}'::jsonb)`,
      [ids.user1],
    )),
    /push_subscriptions_valid_endpoint_chk/i,
  );

  await assert.rejects(
    () => runAsRole('service_role', null, () => db.query(
      `insert into public.push_subscriptions (user_id, endpoint, subscription)
       values ($1, 'https://fcm.googleapis.com/a', '{"endpoint":"https://127.0.0.1/b"}'::jsonb)`,
      [ids.user1],
    )),
    /push_subscriptions_valid_endpoint_chk/i,
  );
});
