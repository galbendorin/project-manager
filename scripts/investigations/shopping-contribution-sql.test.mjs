// Executable PostgreSQL contract tests, isolated from user data.
// PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test <this file>
// Single connection: this does NOT certify multi-session lock ordering.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
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
    assert.equal((await db.query('select confirmed_revision from public.shopping_contributions')).rows[0].confirmed_revision, 0);
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
