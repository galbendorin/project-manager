// Executable PostgreSQL contract tests, isolated from user data.
// PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test <this file>
// PMW_NATIVE_POSTGRES_MODULE=/absolute/path/to/embedded-postgres/dist/index.js
// Native mode also runs deterministic multi-session cases in the same fixture.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { applyShoppingContribution, reconcileShoppingContribution } from '../../src/utils/shoppingContributionRpc.js';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingCreateJournal } from '../../src/utils/shoppingCreateJournal.js';
import { createShoppingCreateOperations } from '../../src/utils/shoppingCreateOperation.js';
import { createShoppingCreateWorkspace, projectShoppingCreates } from '../../src/utils/shoppingCreateWorkspace.js';
import { createShoppingInputBatches } from '../../src/utils/shoppingInputBatches.js';
import { memoryStorage } from './shopping-input-test-fixture.mjs';

const db = await createShoppingTestDatabase();
const owner = randomUUID();
const member = randomUUID();
const outsider = randomUUID();
const project = randomUUID();
const otherProject = randomUUID();
const batch = randomUUID();
const migration = '2026-09-07_add_shopping_contribution_contract.sql';
const sql = name => readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const executeMigration = async name => db.exec((await sql(name))
  .replaceAll('create extension if not exists pgcrypto;', '-- Core gen_random_uuid is sufficient for this fixture.'));

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.projects(id uuid primary key, user_id uuid references auth.users(id), updated_at timestamptz default now());
    create table public.meal_plan_grocery_batches(id uuid primary key);
  `);
  await executeMigration('2026-02-23_create_manual_todos.sql');
  await executeMigration('2026-03-24_add_project_members_and_shared_access.sql');
  const mealSchema = await sql('2026-04-09_add_meal_planner.sql');
  await db.exec(mealSchema.match(/alter table public.manual_todos[\s\S]*?;/)[0]);
  const entitlementSql = await sql('2026-04-18_harden_server_entitlements_and_checkout.sql');
  await db.exec(entitlementSql.match(/create or replace function public.normalize_shopping_title[\s\S]*?\$\$;/)[0]);
  await executeMigration('2026-07-15_add_shopping_list_idempotent_add.sql');
  await db.exec('grant select, insert, update, delete on public.manual_todos, public.projects, public.project_members to authenticated;');
  await executeMigration(migration);
});

beforeEach(async () => {
  await db.exec('truncate auth.users, public.projects, public.meal_plan_grocery_batches cascade;');
  await db.query('insert into auth.users(id) values ($1), ($2), ($3)', [owner, member, outsider]);
  await db.query('insert into public.projects(id, user_id) values ($1,$2),($3,$2)', [project, owner, otherProject]);
  await db.query("insert into public.project_members(project_id, user_id, member_email, invited_by_user_id) values ($1,$2,'member@example.test',$3)", [project, member, owner]);
  await db.query('insert into public.meal_plan_grocery_batches(id) values ($1)', [batch]);
});
after(async () => db.close());

function asUser(user, query, params = [], role = 'authenticated') {
  return db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user || '']);
    await tx.exec(role === 'anon' ? 'set local role anon' : 'set local role authenticated');
    return tx.query(query, params);
  });
}
async function add({ op = randomUUID(), user = member, title = 'Milk', qty = 1, unit = 'carton', source = '', meta = {}, sourceBatch = null, projectId = project, version = 3 } = {}) {
  const { rows } = await asUser(user, `select to_jsonb(public.apply_shopping_list_add_v${version}($1,$2,$3,$4,$5,$6,$7,$8)) as result`,
    [op, projectId, title, qty, unit, source, sourceBatch, meta]);
  return { op, ...rows[0].result };
}
async function intent(op, { id = randomUUID(), revision = 1, cancel = true, title = 'Bread', qty = 1, unit = 'loaf', status = 'Open', user = member, projectId = project } = {}) {
  const { rows } = await asUser(user, 'select public.reconcile_shopping_contribution_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
    [op, projectId, id, revision, cancel, title, qty, unit, status]);
  return rows[0].result;
}
async function seed({ title = 'Milk', qty = 2, unit = 'carton', meta = {}, source = '' } = {}) {
  const { rows } = await asUser(owner, `insert into public.manual_todos(user_id, project_id, title, quantity_value, quantity_unit, meta, source_type)
    values ($1,$2,$3,$4,$5,$6,$7) returning *`, [owner, project, title, qty, unit, meta, source]);
  return rows[0];
}
const items = async () => (await db.query('select * from public.manual_todos order by title, id')).rows;

// Exercise the production response validators against actual SQL JSON, with
// the same named parameters sent through Supabase's RPC interface.
const contributionClient = {
  async rpc(name, args) {
    assert.ok(['apply_shopping_list_add_v3', 'reconcile_shopping_contribution_v1'].includes(name));
    const entries = Object.entries(args);
    const named = entries.map(([key], index) => `${key} => $${index + 1}`).join(', ');
    const { rows } = await asUser(member, `select public.${name}(${named}) as result`, entries.map(([, value]) => value));
    return { data: rows[0].result, error: null };
  },
};

function operationFixture(t, rpc = contributionClient.rpc.bind(contributionClient)) {
  const indexedDB = new IDBFactory();
  const journals = [];
  const operationId = randomUUID();
  const make = () => {
    const journal = createShoppingCreateJournal({ userId: member, getCurrentUserId: () => member, indexedDB });
    journals.push(journal);
    return { journal, controller: createShoppingCreateOperations({ journal, supabaseClient: { rpc },
      getCurrentUserId: () => member, createIntentId: randomUUID }) };
  };
  t.after(() => journals.forEach(journal => journal.close()));
  return { make, operationId, create: controller => controller.create({ operationId, projectId: project,
    localId: `offline-${operationId}`, item: { title: 'Milk', quantityValue: 1, quantityUnit: 'carton' } }) };
}
const signal = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

for (const patch of [{ title: 'Oat milk' }, { cancel: true }]) {
  test(`workspace retains captured pending contribution after a real SQL acknowledgement: ${JSON.stringify(patch)}`, async t => {
    await seed();
    const journal = createShoppingCreateJournal({ userId: member, getCurrentUserId: () => member, indexedDB: new IDBFactory() });
    let online = false, snapshot = { records: [] }, currentRows = [];
    const inputStorage = memoryStorage();
    const workspace = createShoppingCreateWorkspace({ journal,
      inputBatches: createShoppingInputBatches({ userId: member, getCurrentUserId: () => member, storage: () => inputStorage }),
      transport: { ...contributionClient, readProject: async () => (await asUser(member, 'select * from public.manual_todos where project_id = $1', [project])).rows },
      getCurrentUserId: () => member, isOnline: () => online,
      onChange: value => { snapshot = value; }, onRefresh: async (_projectId, rows) => { currentRows = rows; } });
    t.after(() => workspace.close());
    await workspace.add(project, [{ title: 'Milk', quantityValue: 1, quantityUnit: 'carton' }]);
    const captured = projectShoppingCreates({ todos: [], records: snapshot.records, projectId: project })[0];
    online = true; await workspace.sync();
    assert.equal(currentRows[0].quantity_value, 3);
    online = false; await workspace.edit(captured, patch);
    online = true; await workspace.sync();
    assert.equal(currentRows.find(row => row.title === 'Milk').quantity_value, 2);
    assert.equal(currentRows.length, patch.cancel ? 1 : 2);
    if (!patch.cancel) assert.equal(currentRows.find(row => row.title === 'Oat milk').quantity_value, 1);
  });
}

for (const change of [{ title: 'Oat milk' }, { cancel: true }]) {
  test(`durable controller preserves a later draft after a real merged add: ${JSON.stringify(change)}`, async t => {
    await seed();
    const committed = signal();
    const release = signal();
    const fixture = operationFixture(t, async (name, args) => {
      const response = await contributionClient.rpc(name, args);
      if (name.endsWith('_v3')) { committed.resolve(); await release.promise; }
      return response;
    });
    const { controller } = fixture.make();
    await fixture.create(controller);
    const pending = controller.syncOnce(fixture.operationId);
    await committed.promise;
    assert.equal((await items())[0].quantity_value, 3);
    await controller.edit(fixture.operationId, '0', change);
    release.resolve();
    assert.equal((await pending).progress.status, 'pending_change');
    const reconciled = await controller.syncOnce(fixture.operationId);
    assert.equal(reconciled.error, null);
    assert.equal(reconciled.progress.status, 'settled');
    const rows = await items();
    assert.equal(rows.find(row => row.title === 'Milk').quantity_value, 2);
    assert.equal(rows.length, change.cancel ? 1 : 2);
    if (!change.cancel) assert.equal(rows.find(row => row.title === change.title).quantity_value, 1);
  });
}

test('durable controller reopens after lost real add and move responses without duplicate quantity', async t => {
  await seed();
  await seed({ title: 'Bread', qty: 4, unit: 'loaf' });
  let loseAdd = true;
  let loseIntent = true;
  const fixture = operationFixture(t, async (name, args) => {
    const response = await contributionClient.rpc(name, args);
    if (name.endsWith('_v3') && loseAdd) { loseAdd = false; throw new Error('lost committed add'); }
    if (name.endsWith('_v1') && loseIntent) { loseIntent = false; throw new Error('lost committed move'); }
    return response;
  });
  const first = fixture.make();
  await fixture.create(first.controller);
  assert.ok((await first.controller.syncOnce(fixture.operationId)).error);
  await first.controller.edit(fixture.operationId, '0', { title: 'Bread', quantityUnit: 'loaf' });
  first.journal.close();
  const second = fixture.make();
  assert.equal((await second.controller.syncOnce(fixture.operationId)).progress.status, 'pending_change');
  assert.equal((await items()).find(row => row.title === 'Milk').quantity_value, 3);
  assert.ok((await second.controller.syncOnce(fixture.operationId)).error);
  assert.equal((await items()).find(row => row.title === 'Bread').quantity_value, 5);
  await second.controller.edit(fixture.operationId, '1', { cancel: true });
  second.journal.close();
  const third = fixture.make().controller;
  assert.equal((await third.syncOnce(fixture.operationId)).progress.status, 'pending_change');
  assert.equal((await items()).find(row => row.title === 'Bread').quantity_value, 5);
  assert.equal((await third.syncOnce(fixture.operationId)).progress.status, 'settled');
  assert.deepEqual((await items()).map(row => row.quantity_value).sort(), [2, 4]);
  const receipts = await db.query('select count(*)::integer as count from public.shopping_contribution_intents');
  assert.equal(receipts.rows[0].count, 2);
});

test('durable controller retains conflict after a household member changes the contribution', async t => {
  const fixture = operationFixture(t, async (name, args) => {
    const response = await contributionClient.rpc(name, args);
    if (name.endsWith('_v3')) throw new Error('lost add response');
    return response;
  });
  const first = fixture.make();
  await fixture.create(first.controller);
  await first.controller.syncOnce(fixture.operationId);
  await first.controller.edit(fixture.operationId, '0', { cancel: true });
  const replay = createShoppingCreateOperations({ journal: first.journal, supabaseClient: contributionClient,
    getCurrentUserId: () => member, createIntentId: randomUUID });
  await replay.syncOnce(fixture.operationId);
  const [row] = await items();
  await asUser(owner, 'update public.manual_todos set quantity_value = 9 where id = $1', [row.id]);
  const conflict = await replay.syncOnce(fixture.operationId);
  assert.equal(conflict.error, null);
  assert.equal(conflict.progress.reason, 'needs_review');
  assert.equal(conflict.progress.desired.cancel, true);
  assert.equal((await replay.syncOnce(fixture.operationId)).sent, false);
  assert.equal((await items())[0].quantity_value, 9);
});

for (const shared of [false, true]) {
  test(`durable controller reconciles pre-send Done without completing a shared row (shared=${shared})`, async t => {
    if (shared) await seed();
    const fixture = operationFixture(t);
    const { controller } = fixture.make();
    await fixture.create(controller);
    await controller.edit(fixture.operationId, '0', { status: 'Done' });
    assert.equal((await controller.syncOnce(fixture.operationId)).progress.status, 'pending_change');
    const result = await controller.syncOnce(fixture.operationId);
    assert.equal(result.error, null);
    assert.equal(result.progress.status, shared ? 'needs_review' : 'settled');
    assert.equal((await items())[0].status, shared ? 'Open' : 'Done');
  });
}

test('client adapters accept real add, merge, move, cancel and historical replay responses', async () => {
  await seed();
  await seed({ title: 'Bread', qty: 4, unit: 'loaf' });
  const operationId = randomUUID();
  const request = { supabaseClient: contributionClient, operationId, projectId: project, userId: member,
    item: { title: 'Milk', quantityValue: 1, quantityUnit: 'carton' } };
  const added = await applyShoppingContribution(request);
  assert.equal(added.error, null);
  assert.equal(added.data.contribution.kind, 'merged');
  const move = { supabaseClient: contributionClient, operationId, projectId: project, intentId: randomUUID(),
    desiredRevision: '1', desired: { cancel: false, title: 'Bread', quantityValue: 1, quantityUnit: 'loaf' } };
  const moved = await reconcileShoppingContribution(move);
  assert.equal(moved.error, null);
  assert.equal(moved.data.outcome, 'applied');
  const cancelled = await reconcileShoppingContribution({ ...move, intentId: randomUUID(), desiredRevision: '2', desired: { cancel: true } });
  assert.equal(cancelled.error, null);
  assert.equal(cancelled.data.contribution, null);
  const replay = await reconcileShoppingContribution(move);
  assert.equal(replay.error, null);
  assert.equal(replay.data.replayed, true);
  assert.equal(replay.data.latest_confirmed_revision, '2');
  const addReplay = await applyShoppingContribution(request);
  assert.equal(addReplay.error, null);
  assert.equal(addReplay.data.row_exists, false);
  assert.deepEqual((await items()).map(row => row.quantity_value).sort(), [2, 4]);
});

test('client adapters retain real needs_review and superseded outcomes', async () => {
  const operationId = randomUUID();
  const added = await applyShoppingContribution({ supabaseClient: contributionClient, operationId,
    projectId: project, userId: member, item: { title: 'Milk' } });
  assert.equal(added.error, null);
  assert.equal(added.data.contribution.kind, 'inserted');
  await asUser(owner, 'update public.manual_todos set quantity_value = 9 where id = $1', [added.data.contribution.row_id]);
  const request = { supabaseClient: contributionClient, operationId, projectId: project,
    intentId: randomUUID(), desiredRevision: '2', desired: { cancel: true } };
  const review = await reconcileShoppingContribution(request);
  assert.equal(review.error, null);
  assert.equal(review.data.outcome, 'needs_review');
  const older = await reconcileShoppingContribution({ ...request, intentId: randomUUID(), desiredRevision: '1' });
  assert.equal(older.error, null);
  assert.equal(older.data.outcome, 'superseded');
  assert.equal((await items())[0].quantity_value, 9);
});

test('migration can be applied twice without resetting recorded revisions', async () => {
  const original = await add();
  await executeMigration(migration);
  const replay = await add({ op: original.op });
  assert.equal(replay.outcome, 'already_applied');
  assert.deepEqual(replay.contribution, original.contribution);
});

test('insert receipt supplies exact evidence and replay does not add twice', async () => {
  const first = await add();
  assert.equal(first.contribution.kind, 'inserted');
  assert.equal(first.contribution.before, null);
  assert.equal(first.row_exists, true);
  assert.equal(typeof first.contribution.revision, 'string');
  const replay = await add({ op: first.op });
  assert.equal(replay.outcome, 'already_applied');
  assert.deepEqual(replay.contribution, first.contribution);
  assert.equal((await items()).length, 1);
});

for (const variant of [
  { label: 'equal units', before: 2, unit: 'carton', add: 1, addUnit: 'carton', expected: 3 },
  { label: 'case and spaces in units', before: 2, unit: ' Carton ', add: 1, addUnit: 'CARTON', expected: 3 },
  { label: 'no prior quantity', before: null, unit: '', add: 1, addUnit: 'carton', expected: 1 },
  { label: 'missing prior unit', before: 2, unit: '', add: 1, addUnit: 'carton', expected: 1 },
  { label: 'conflicting units', before: 2, unit: 'litre', add: 1, addUnit: 'carton', expected: 2 },
  { label: 'no submitted quantity', before: 2, unit: 'carton', add: null, addUnit: '', expected: 2 },
  { label: 'both units absent', before: 2, unit: '', add: 1, addUnit: '', expected: 2 },
  { label: 'zero quantity', before: 2, unit: 'carton', add: 0, addUnit: 'carton', expected: 2 },
  { label: 'rounded contribution', before: 2.124, unit: 'carton', add: 0.005, addUnit: 'carton', expected: 2.13 },
]) {
  test(`merge cancellation restores exact before state: ${variant.label}`, async () => {
    const existing = await seed({ qty: variant.before, unit: variant.unit });
    const added = await add({ qty: variant.add, unit: variant.addUnit, source: 'meal_plan', sourceBatch: batch, meta: { origin: 'test' } });
    assert.equal(added.contribution.kind, 'merged');
    assert.equal(added.current_item.quantity_value, variant.expected);
    const cancelled = await intent(added.op);
    assert.equal(cancelled.outcome, 'applied');
    const [remaining] = await items();
    assert.equal(remaining.id, existing.id);
    for (const field of ['quantity_value', 'quantity_unit', 'source_type', 'source_batch_id', 'meta', 'title', 'status', 'user_id']) {
      assert.deepEqual(remaining[field], existing[field], field);
    }
  });
}

test('merge preserves pre-existing metadata and source on undo', async () => {
  const existing = await seed({ source: 'manual', meta: { existing: true } });
  const added = await add({ source: 'meal_plan', meta: { new: true } });
  await intent(added.op);
  assert.deepEqual((await items())[0].meta, existing.meta);
  assert.equal((await items())[0].source_type, existing.source_type);
});

test('cancel an inserted contribution deletes it once; add replay never resurrects it', async () => {
  const added = await add();
  const id = randomUUID();
  assert.equal((await intent(added.op, { id })).outcome, 'applied');
  const replay = await intent(added.op, { id });
  assert.equal(replay.replayed, true);
  assert.equal((await items()).length, 0);
  const addReplay = await add({ op: added.op });
  assert.equal(addReplay.row_exists, false);
  assert.equal(addReplay.current_item, null);
  assert.equal(addReplay.contribution, null);
});

test('move then cancel retains evidence for the new contribution', async () => {
  const milk = await seed();
  const bread = await seed({ title: 'Bread', qty: 4, unit: 'loaf' });
  const added = await add();
  const moved = await intent(added.op, { cancel: false });
  assert.equal(moved.outcome, 'applied');
  assert.equal(moved.contribution.kind, 'merged');
  assert.equal(moved.contribution.row_id, bread.id);
  assert.equal(moved.affected_items.length, 2);
  assert.equal((await items()).find(row => row.id === milk.id).quantity_value, 2);
  assert.equal((await items()).find(row => row.id === bread.id).quantity_value, 5);
  assert.equal((await intent(added.op, { revision: 2 })).outcome, 'applied');
  assert.equal((await items()).find(row => row.id === bread.id).quantity_value, 4);
});

test('quantity revision replaces only the pending contribution', async () => {
  await seed();
  const added = await add();
  const result = await intent(added.op, { cancel: false, title: 'Milk', qty: 4, unit: 'carton' });
  assert.equal(result.affected_items.length, 1);
  assert.equal(result.affected_items[0].quantity_value, 6);
  assert.equal((await items())[0].quantity_value, 6);
  await intent(added.op, { revision: 2 });
  assert.equal((await items())[0].quantity_value, 2);
});

for (const change of [
  { label: 'title', query: "update public.manual_todos set title = 'Oat milk' where id = $1" },
  { label: 'quantity', query: 'update public.manual_todos set quantity_value = 9 where id = $1' },
  { label: 'completion', query: "update public.manual_todos set status = 'Done' where id = $1" },
  { label: 'metadata', query: 'update public.manual_todos set meta = \'{"other":true}\' where id = $1' },
  { label: 'no-op write', query: 'update public.manual_todos set title = title where id = $1' },
  { label: 'deletion', query: 'delete from public.manual_todos where id = $1' },
]) {
  test(`intervening ${change.label} produces needs_review with no mutation`, async () => {
    await seed();
    const added = await add();
    await asUser(owner, change.query, [added.contribution.row_id]);
    const beforeItems = await items();
    const result = await intent(added.op, { cancel: false });
    assert.equal(result.outcome, 'needs_review');
    assert.equal(result.confirmed_revision, '0');
    assert.deepEqual(await items(), beforeItems);
  });
}

test('change then revert still invalidates undo evidence', async () => {
  const added = await add();
  await asUser(owner, "update public.manual_todos set title = 'Changed' where id = $1", [added.contribution.row_id]);
  await asUser(owner, "update public.manual_todos set title = 'Milk' where id = $1", [added.contribution.row_id]);
  assert.equal((await intent(added.op)).outcome, 'needs_review');
});

test('caller cannot forge a revision on update or same-ID reinsertion', async () => {
  const added = await add();
  await asUser(member, 'update public.manual_todos set shopping_revision = $1 where id = $2', [added.contribution.revision, added.contribution.row_id]);
  assert.notEqual(String((await items())[0].shopping_revision), added.contribution.revision);
  await asUser(member, 'delete from public.manual_todos where id = $1', [added.contribution.row_id]);
  await asUser(member, 'insert into public.manual_todos(id, user_id, project_id, title, shopping_revision) values ($1,$2,$3,$4,$5)',
    [added.contribution.row_id, member, project, 'Milk', added.contribution.revision]);
  assert.equal((await intent(added.op)).outcome, 'needs_review');
});

test('v2 is still callable and its later write invalidates v3 evidence', async () => {
  const added = await add();
  const legacy = await add({ user: owner, version: 2 });
  assert.equal(legacy.quantity_value, 2);
  assert.equal((await intent(added.op)).outcome, 'needs_review');
});

test('legacy operation cannot be silently converted or added twice', async () => {
  const legacy = await add({ version: 2 });
  await assert.rejects(add({ op: legacy.op }), /SHOPPING_LEGACY_OPERATION_NEEDS_REVIEW/);
  assert.equal((await items())[0].quantity_value, 1);
});

test('older client cannot apply an acknowledged v3 operation a second time', async () => {
  const added = await add();
  await assert.rejects(add({ op: added.op, version: 2 }), /SHOPPING_OPERATION_REQUIRES_V3/);
  assert.equal((await items())[0].quantity_value, 1);
});

test('deleted or moved row is absent on add replay; historical image is not current data', async () => {
  const added = await add({ user: owner });
  await asUser(owner, 'update public.manual_todos set project_id = $1 where id = $2', [otherProject, added.contribution.row_id]);
  const replay = await add({ user: owner, op: added.op });
  assert.equal(replay.row_exists, false);
  assert.equal(replay.current_item, null);
  assert.equal((await intent(added.op, { user: owner })).outcome, 'needs_review');
});

test('immutable add and intent payloads reject conflicting reuse', async () => {
  const added = await add();
  await assert.rejects(add({ op: added.op, title: 'Bread' }), /SHOPPING_OPERATION_PAYLOAD_MISMATCH/);
  const id = randomUUID();
  await intent(added.op, { id, cancel: false });
  await assert.rejects(intent(added.op, { id, cancel: true }), /SHOPPING_INTENT_PAYLOAD_MISMATCH/);
  await assert.rejects(intent(added.op, { id: randomUUID(), cancel: false }), /SHOPPING_INTENT_PAYLOAD_MISMATCH/);
  await assert.rejects(intent(added.op, { id, revision: 2 }), /SHOPPING_INTENT_ID_REUSED/);
});

test('late older revision cannot undo a newer move; replay exposes latest confirmed revision', async () => {
  const added = await add();
  const firstId = randomUUID();
  await intent(added.op, { id: firstId, cancel: false });
  await intent(added.op, { revision: 3, cancel: false, title: 'Apples' });
  const beforeItems = await items();
  assert.equal((await intent(added.op, { revision: 2 })).outcome, 'superseded');
  const replay = await intent(added.op, { id: firstId, cancel: false });
  assert.equal(replay.latest_confirmed_revision, '3');
  assert.deepEqual(await items(), beforeItems);
});

test('needs_review replay stays unresolved and does not advance confirmed revision', async () => {
  const added = await add();
  await asUser(owner, 'update public.manual_todos set quantity_value = 7 where id = $1', [added.contribution.row_id]);
  const id = randomUUID();
  await intent(added.op, { id });
  const replay = await intent(added.op, { id });
  assert.equal(replay.outcome, 'needs_review');
  assert.equal(replay.confirmed_revision, '0');
  assert.equal(replay.replayed, true);
});

test('a newer unresolved intent prevents a delayed older cancellation', async () => {
  await seed({ title: 'Bread', unit: 'loaf' });
  const added = await add();
  const result = await intent(added.op, { revision: 3, cancel: false, status: 'Done' });
  assert.equal(result.outcome, 'needs_review');
  assert.equal(result.confirmed_revision, '0');
  const beforeItems = await items();
  assert.equal((await intent(added.op, { revision: 2 })).outcome, 'superseded');
  assert.deepEqual(await items(), beforeItems);
});

for (const user of [null, outsider, owner]) {
  test(`receipt ownership and access enforced for ${user === null ? 'unauthenticated' : user === outsider ? 'outsider' : 'different project owner'}`, async () => {
    const added = await add();
    const expected = user === null ? /AUTHENTICATION_REQUIRED/ : user === outsider ? /PROJECT_ACCESS_REQUIRED/ : /SHOPPING_OPERATION_ACCESS_REQUIRED/;
    await assert.rejects(add({ op: added.op, user }), expected);
    await assert.rejects(intent(added.op, { user }), expected);
  });
}

test('removed member loses access to add and intent replay receipts', async () => {
  const added = await add();
  const id = randomUUID();
  await intent(added.op, { id, cancel: false });
  await asUser(owner, 'delete from public.project_members where project_id = $1', [project]);
  await assert.rejects(add({ op: added.op }), /PROJECT_ACCESS_REQUIRED/);
  await assert.rejects(intent(added.op, { id, cancel: false }), /PROJECT_ACCESS_REQUIRED/);
  await assert.rejects(add({ op: added.op, version: 2 }), /PROJECT_ACCESS_REQUIRED/);
});

test('legacy-only receipt also rechecks access after membership removal', async () => {
  const added = await add({ version: 2 });
  await asUser(owner, 'delete from public.project_members where project_id = $1', [project]);
  await assert.rejects(add({ op: added.op, version: 2 }), /PROJECT_ACCESS_REQUIRED/);
});

test('legacy replay rejects a different accessible project and hides moved row changes', async () => {
  const added = await add({ version: 2, user: owner });
  await assert.rejects(add({ op: added.op, version: 2, user: owner, projectId: otherProject }), /SHOPPING_OPERATION_ACCESS_REQUIRED/);
  await asUser(owner, "update public.manual_todos set project_id = $1, title = 'Private change' where id = $2", [otherProject, added.id]);
  const replay = await add({ op: added.op, version: 2, user: owner });
  assert.equal(replay.title, 'Milk');
});

test('receipt project binding rejects a different accessible project', async () => {
  const added = await add({ user: owner });
  await assert.rejects(add({ op: added.op, user: owner, projectId: otherProject }), /SHOPPING_OPERATION_ACCESS_REQUIRED/);
  await assert.rejects(intent(added.op, { user: owner, projectId: otherProject }), /SHOPPING_OPERATION_ACCESS_REQUIRED/);
});

test('anon RPCs and authenticated direct receipt/helper/sequence access denied', async () => {
  await assert.rejects(asUser(null, 'select public.apply_shopping_list_add_v3($1,$2,$3)', [randomUUID(), project, 'Milk'], 'anon'), /permission denied/);
  await assert.rejects(asUser(null, 'select public.reconcile_shopping_contribution_v1($1,$2,$3,1,true)', [randomUUID(), project, randomUUID()], 'anon'), /permission denied/);
  for (const query of [
    'select * from public.shopping_contributions',
    'select * from public.shopping_contribution_intents',
    'delete from public.shopping_contributions',
    "select nextval('public.shopping_write_revision_seq')",
    "select public.record_shopping_contribution(null,'{}')",
    'select public.lock_shopping_project_access(null,null)',
  ]) await assert.rejects(asUser(member, query), /permission denied/);
});

test('shared todo RLS still excludes outsider reads and writes', async () => {
  const existing = await seed();
  assert.equal((await asUser(outsider, 'select * from public.manual_todos')).rows.length, 0);
  assert.equal((await asUser(outsider, 'update public.manual_todos set title = $1 where id = $2 returning id', ['Hacked', existing.id])).rows.length, 0);
  assert.equal((await items())[0].title, 'Milk');
});

test('failed replacement rolls back undo and does not consume the intent', async () => {
  const existing = await seed();
  const added = await add();
  const beforeItems = await items();
  const id = randomUUID();
  await db.exec(`create function public.reject_test_bread() returns trigger language plpgsql as $$
    begin if new.title = 'Bread' then raise exception 'TEST_REPLACEMENT_FAILURE'; end if; return new; end $$;
    create trigger reject_test_bread before insert on public.manual_todos for each row execute function public.reject_test_bread();`);
  try {
    await assert.rejects(intent(added.op, { id, cancel: false }), /TEST_REPLACEMENT_FAILURE/);
    assert.deepEqual(await items(), beforeItems);
    assert.equal((await db.query('select * from public.shopping_contribution_intents')).rows.length, 0);
    assert.equal((await db.query('select * from public.shopping_list_operation_receipts')).rows.length, 0);
  } finally {
    await db.exec('drop trigger reject_test_bread on public.manual_todos; drop function public.reject_test_bread();');
  }
  assert.equal((await intent(added.op, { id, cancel: false })).outcome, 'applied');
  assert.equal((await items()).find(row => row.id === existing.id).quantity_value, 2);
});

test('completion applies to an exclusive inserted contribution and can be cancelled', async () => {
  const added = await add();
  const result = await intent(added.op, { cancel: false, title: 'Milk', status: 'Done' });
  assert.equal(result.outcome, 'applied');
  assert.equal((await items())[0].status, 'Done');
  await intent(added.op, { revision: 2 });
  assert.equal((await items()).length, 0);
});

test('completion cannot mark an existing shared grocery done', async () => {
  await seed();
  const added = await add();
  const beforeItems = await items();
  const result = await intent(added.op, { cancel: false, title: 'Milk', status: 'Done' });
  assert.equal(result.outcome, 'needs_review');
  assert.deepEqual(await items(), beforeItems);
});

test('late destination appearance rolls back the whole completion move', async () => {
  const added = await add();
  const beforeItems = await items();
  // Inject the otherwise concurrent appearance after the precheck. This tests
  // the rollback branch, not native multi-session transaction visibility.
  await db.exec(`create function public.inject_test_destination() returns trigger language plpgsql as $$
    begin insert into public.manual_todos(user_id, project_id, title, quantity_value, quantity_unit)
      values (old.user_id, old.project_id, 'Bread', 5, 'loaf'); return old; end $$;
    create trigger inject_test_destination after delete on public.manual_todos for each row execute function public.inject_test_destination();`);
  try {
    const result = await intent(added.op, { cancel: false, status: 'Done' });
    assert.equal(result.outcome, 'needs_review');
    assert.equal(result.confirmed_revision, '0');
    assert.deepEqual(await items(), beforeItems);
    assert.equal(String((await db.query('select confirmed_revision from public.shopping_contributions')).rows[0].confirmed_revision), '0');
  } finally {
    await db.exec('drop trigger inject_test_destination on public.manual_todos; drop function public.inject_test_destination();');
  }
});

test('newer intent can re-add after cancellation without replay resurrecting the old row', async () => {
  const added = await add();
  await intent(added.op);
  await intent(added.op, { revision: 2, cancel: false });
  assert.equal((await items()).length, 1);
  assert.equal((await items())[0].title, 'Bread');
  const replay = await add({ op: added.op });
  assert.equal(replay.confirmed_revision, '2');
  assert.equal(replay.current_item.title, 'Bread');
});

for (const qty of [-1, 'NaN', 'Infinity', '-Infinity']) {
  test(`invalid quantity ${qty} rejects before mutation`, async () => {
    await assert.rejects(add({ qty }), /SHOPPING_ITEM_INVALID/);
    assert.equal((await items()).length, 0);
    const added = await add();
    await assert.rejects(intent(added.op, { cancel: false, qty }), /SHOPPING_ITEM_INVALID/);
    assert.equal((await items())[0].quantity_value, 1);
  });
}

const nativeTest = (name, callback) => test(`native concurrency: ${name}`, { skip: !db.native, timeout: 20000 }, callback);
const observed = promise => promise.then(value => ({ value }), error => ({ error }));
async function expectSuccess(promise) {
  const result = await promise;
  if (result.error) throw result.error;
  return result.value;
}
async function waitForBlocked(count = 1) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await db.query("select count(*)::integer as count from pg_stat_activity where datname = current_database() and state = 'active' and wait_event_type = 'Lock'");
    if (rows[0].count >= count) return;
    await delay(10);
  }
  throw new Error(`Expected ${count} database sessions to reach their lock barriers`);
}
async function withGate(lockQuery, params, callback) {
  const gate = await db.connection();
  try {
    await gate.query(lockQuery, params);
    await callback(() => gate.query('select pg_advisory_unlock_all()'));
  } finally {
    await gate.query('select pg_advisory_unlock_all()');
    await gate.close();
  }
}
async function withHelperBarrier(callback) {
  const { rows } = await db.query("select pg_get_functiondef('public.record_shopping_contribution(uuid,jsonb)'::regprocedure) as definition");
  const original = rows[0].definition;
  const marker = '  if before_row.id is null then';
  assert.equal(original.split(marker).length, 2);
  // Instrument only the scheduling point, leaving target capture and mutation
  // unchanged. Each competing write commits through a different connection.
  await db.exec(original.replace(marker, `  perform pg_advisory_xact_lock(900000000001::bigint);\n${marker}`));
  try {
    await withGate('select pg_advisory_lock(900000000001::bigint)', [], callback);
  } finally { await db.exec(original); }
}

nativeTest('two retries of the same add apply one contribution', async () => {
  const op = randomUUID();
  await withGate('select pg_advisory_lock(hashtext($1))', [`${project}:milk`], async release => {
    const first = observed(add({ op }));
    await waitForBlocked();
    const second = observed(add({ op }));
    await waitForBlocked(2);
    await release();
    const results = await Promise.all([expectSuccess(first), expectSuccess(second)]);
    assert.deepEqual(results.map(result => result.outcome).sort(), ['already_applied', 'applied']);
  });
  assert.equal((await items()).length, 1);
  assert.equal((await items())[0].quantity_value, 1);
});

nativeTest('two copies of a cancellation undo once', async () => {
  await seed();
  const added = await add();
  const id = randomUUID();
  await withGate('select pg_advisory_lock(hashtext($1))', [`${member}:${added.op}`], async release => {
    const first = observed(intent(added.op, { id }));
    const second = observed(intent(added.op, { id }));
    await waitForBlocked(2);
    await release();
    const results = await Promise.all([expectSuccess(first), expectSuccess(second)]);
    assert.deepEqual(results.map(result => result.replayed).sort(), [false, true]);
  });
  assert.equal((await items())[0].quantity_value, 2);
});

nativeTest('overlapping old cancellation and newer move converge on the newer intent', async () => {
  const added = await add();
  await withGate('select pg_advisory_lock(hashtext($1))', [`${member}:${added.op}`], async release => {
    const newer = observed(intent(added.op, { revision: 3, cancel: false }));
    const older = observed(intent(added.op, { revision: 2 }));
    await waitForBlocked(2);
    await release();
    await Promise.all([expectSuccess(newer), expectSuccess(older)]);
  });
  assert.equal((await items()).length, 1);
  assert.equal((await items())[0].title, 'Bread');
  assert.equal((await add({ op: added.op })).confirmed_revision, '3');
});

nativeTest('same operation cannot be applied through both v2 and v3', async () => {
  const op = randomUUID();
  await withGate('select pg_advisory_lock(hashtext($1))', [`${member}:${op}`], async release => {
    const v2 = observed(add({ op, version: 2 }));
    const v3 = observed(add({ op }));
    await waitForBlocked(2);
    await release();
    const results = await Promise.all([v2, v3]);
    assert.equal(results.filter(result => result.value).length, 1);
    const failure = results.find(result => result.error).error;
    assert.match(failure.message, /SHOPPING_OPERATION_REQUIRES_V3|SHOPPING_LEGACY_OPERATION_NEEDS_REVIEW/);
  });
  assert.equal((await items())[0].quantity_value, 1);
});

nativeTest('different v2 and v3 adds merge without losing either contribution', async () => {
  await withGate('select pg_advisory_lock(hashtext($1))', [`${project}:milk`], async release => {
    const v2 = observed(add({ version: 2, user: owner }));
    const v3 = observed(add());
    await waitForBlocked(2);
    await release();
    await Promise.all([expectSuccess(v2), expectSuccess(v3)]);
  });
  assert.equal((await items()).length, 1);
  assert.equal((await items())[0].quantity_value, 2);
});

nativeTest('opposite-title moves finish without deadlock or lost quantities', async () => {
  const milk = await add();
  const bread = await add({ title: 'Bread', unit: 'carton', user: owner });
  await withGate('select pg_advisory_lock(least(hashtext($1), hashtext($2)))', [`${project}:milk`, `${project}:bread`], async release => {
    const first = observed(intent(milk.op, { cancel: false, unit: 'carton' }));
    const second = observed(intent(bread.op, { cancel: false, title: 'Milk', unit: 'carton', user: owner }));
    await waitForBlocked(2);
    await release();
    const results = await Promise.all([expectSuccess(first), expectSuccess(second)]);
    assert.deepEqual(results.map(result => result.outcome).sort(), ['applied', 'needs_review']);
  });
  assert.equal((await items()).reduce((sum, row) => sum + row.quantity_value, 0), 2);
});

nativeTest('direct insert after empty target capture never becomes an owned insertion', async () => {
  let added;
  let shared;
  await withHelperBarrier(async release => {
    const pending = observed(add());
    await waitForBlocked();
    shared = await seed({ qty: 7 });
    await release();
    added = await expectSuccess(pending);
    assert.equal(added.contribution.kind, 'inserted');
    assert.notEqual(added.contribution.row_id, shared.id);
  });
  await intent(added.op);
  assert.deepEqual((await items()).map(row => [row.id, row.quantity_value]), [[shared.id, 7]]);
});

nativeTest('direct rename into the title cannot replace a captured merge target', async () => {
  // The earlier row would win a second lookup once renamed into Milk.
  const other = await seed({ title: 'Water', qty: 9 });
  const target = await seed();
  let added;
  await withHelperBarrier(async release => {
    const pending = observed(add());
    await waitForBlocked();
    await asUser(owner, "update public.manual_todos set title = 'Milk' where id = $1", [other.id]);
    await release();
    added = await expectSuccess(pending);
    assert.equal(added.contribution.kind, 'merged');
    assert.equal(added.contribution.row_id, target.id);
    assert.equal(added.contribution.before.quantity_value, 2);
  });
  await intent(added.op);
  const remaining = await items();
  assert.equal(remaining.find(row => row.id === other.id).quantity_value, 9);
  assert.equal(remaining.find(row => row.id === target.id).quantity_value, 2);
});

nativeTest('later direct update waits for the recorded row and prevents stale undo', async () => {
  const target = await seed();
  let added;
  await withHelperBarrier(async release => {
    const pending = observed(add());
    await waitForBlocked();
    const edited = observed(asUser(owner, 'update public.manual_todos set quantity_value = 12 where id = $1', [target.id]));
    await waitForBlocked(2);
    await release();
    added = await expectSuccess(pending);
    await expectSuccess(edited);
  });
  assert.equal((await intent(added.op)).outcome, 'needs_review');
  assert.equal((await items())[0].quantity_value, 12);
});

nativeTest('revocation waits for an already-authorized add, then denies replay', async () => {
  const op = randomUUID();
  await withGate('select pg_advisory_lock(hashtext($1))', [`${project}:milk`], async release => {
    const pending = observed(add({ op }));
    await waitForBlocked();
    const revocation = observed(asUser(owner, 'delete from public.project_members where project_id = $1', [project]));
    await waitForBlocked(2);
    assert.equal((await db.query('select count(*)::integer as count from public.project_members')).rows[0].count, 1);
    await release();
    await expectSuccess(pending);
    await expectSuccess(revocation);
  });
  await assert.rejects(add({ op }), /PROJECT_ACCESS_REQUIRED/);
  assert.equal((await items()).length, 1);
});

nativeTest('revocation winning before authority admission prevents the waiting add', async () => {
  const gate = await db.connection();
  try {
    await gate.query('begin');
    await gate.query('select id from public.projects where id = $1 for update', [project]);
    const pending = observed(add());
    await waitForBlocked();
    await asUser(owner, 'delete from public.project_members where project_id = $1', [project]);
    await gate.query('rollback');
    const result = await pending;
    assert.match(result.error?.message || '', /PROJECT_ACCESS_REQUIRED/);
  } finally {
    await gate.query('rollback');
    await gate.close();
  }
  assert.equal((await items()).length, 0);
});

for (const operation of ['v2 replay', 'reconciliation']) {
  nativeTest(`revocation is ordered after an admitted ${operation}`, async () => {
    const added = await add({ version: operation === 'v2 replay' ? 2 : 3 });
    const request = () => operation === 'v2 replay' ? add({ op: added.op, version: 2 }) : intent(added.op);
    await withGate('select pg_advisory_lock(hashtext($1))', [`${member}:${added.op}`], async release => {
      const pending = observed(request());
      await waitForBlocked();
      const revocation = observed(asUser(owner, 'delete from public.project_members where project_id = $1', [project]));
      await waitForBlocked(2);
      await release();
      await expectSuccess(pending);
      await expectSuccess(revocation);
    });
    await assert.rejects(request(), /PROJECT_ACCESS_REQUIRED/);
  });
}

nativeTest('project deletion waits before cascading into an admitted operation', async () => {
  await withGate('select pg_advisory_lock(hashtext($1))', [`${project}:milk`], async release => {
    const pending = observed(add());
    await waitForBlocked();
    const deletion = observed(asUser(owner, 'delete from public.projects where id = $1', [project]));
    await waitForBlocked(2);
    await release();
    await expectSuccess(pending);
    await expectSuccess(deletion);
  });
  assert.equal((await items()).length, 0);
  assert.equal((await db.query('select * from public.shopping_contributions')).rows.length, 0);
});

nativeTest('project deletion winning first denies the waiting operation without deadlock', async () => {
  const gate = await db.connection();
  try {
    await gate.query('begin');
    await gate.query('delete from public.projects where id = $1', [project]);
    const pending = observed(add());
    await waitForBlocked();
    await gate.query('commit');
    const result = await pending;
    assert.match(result.error?.message || '', /PROJECT_ACCESS_REQUIRED/);
  } finally {
    await gate.query('rollback');
    await gate.close();
  }
  assert.equal((await items()).length, 0);
});

nativeTest('ownership transfer waits for an admitted owner operation and then denies old owner', async () => {
  const op = randomUUID();
  await withGate('select pg_advisory_lock(hashtext($1))', [`${project}:milk`], async release => {
    const pending = observed(add({ op, user: owner }));
    await waitForBlocked();
    const transfer = observed(db.transaction(tx => tx.query('update public.projects set user_id = $1 where id = $2', [outsider, project])));
    await waitForBlocked(2);
    await release();
    await expectSuccess(pending);
    await expectSuccess(transfer);
  });
  await assert.rejects(add({ op, user: owner }), /PROJECT_ACCESS_REQUIRED/);
});

nativeTest('caller deletion waits before receipt and item cascades', async () => {
  await withGate('select pg_advisory_lock(hashtext($1))', [`${project}:milk`], async release => {
    const pending = observed(add());
    await waitForBlocked();
    const deletion = observed(db.transaction(tx => tx.query('delete from auth.users where id = $1', [member])));
    await waitForBlocked(2);
    await release();
    await expectSuccess(pending);
    await expectSuccess(deletion);
  });
  assert.equal((await items()).length, 0);
  assert.equal((await db.query('select * from public.shopping_contributions')).rows.length, 0);
});

nativeTest('caller deletion winning first denies a waiting operation', async () => {
  const gate = await db.connection();
  try {
    await gate.query('begin');
    await gate.query('delete from auth.users where id = $1', [member]);
    const pending = observed(add());
    await waitForBlocked();
    await gate.query('commit');
    const result = await pending;
    assert.match(result.error?.message || '', /AUTHENTICATION_REQUIRED|PROJECT_ACCESS_REQUIRED/);
  } finally {
    await gate.query('rollback');
    await gate.close();
  }
  assert.equal((await items()).length, 0);
});

nativeTest('ownership transfer winning first denies the waiting former owner', async () => {
  const gate = await db.connection();
  try {
    await gate.query('begin');
    await gate.query('update public.projects set user_id = $1 where id = $2', [outsider, project]);
    const pending = observed(add({ user: owner }));
    await waitForBlocked();
    await gate.query('commit');
    const result = await pending;
    assert.match(result.error?.message || '', /PROJECT_ACCESS_REQUIRED/);
  } finally {
    await gate.query('rollback');
    await gate.close();
  }
  assert.equal((await items()).length, 0);
});

nativeTest('backend loss between undo and replacement rolls back and permits the same intent retry', async () => {
  await seed();
  const added = await add();
  const beforeItems = await items();
  const id = randomUUID();
  await withHelperBarrier(async release => {
    const pending = observed(intent(added.op, { id, cancel: false }));
    await waitForBlocked();
    const { rows } = await db.query("select pid from pg_stat_activity where datname = current_database() and state = 'active' and wait_event_type = 'Lock'");
    assert.equal(rows.length, 1);
    await db.query('select pg_terminate_backend($1)', [rows[0].pid]);
    assert.ok((await pending).error);
    await release();
  });
  assert.deepEqual(await items(), beforeItems);
  assert.equal((await db.query('select * from public.shopping_contribution_intents')).rows.length, 0);
  assert.equal((await intent(added.op, { id, cancel: false })).outcome, 'applied');
  assert.equal((await items()).find(row => row.title === 'Milk').quantity_value, 2);
  assert.equal((await items()).find(row => row.title === 'Bread').quantity_value, 1);
});
