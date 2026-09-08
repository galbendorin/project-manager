import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';
import { createShoppingCreateOperations, shoppingCreateProgress } from './shoppingCreateOperation.js';

const entry = { operationId: 'operation-a', projectId: 'project-a', localId: 'offline-a',
  item: { title: 'Milk', quantityValue: 1, quantityUnit: 'carton', meta: { origin: 'manual' } } };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const evidence = (args, kind = 'inserted') => {
  const row = { id: `row-${args.target_title}`, project_id: args.target_project_id, title: args.target_title,
    quantity_value: args.target_quantity_value, status: args.target_status || 'Open' };
  return { kind, row_id: row.id, revision: '9007199254740993', before: kind === 'inserted' ? null : row, after: row };
};
const addAck = (args, extra = {}) => {
  const contribution = evidence(args);
  return { outcome: 'applied', operation_id: args.target_operation_id, project_id: args.target_project_id,
    user_id: 'user-a', confirmed_revision: '0', contribution, row_exists: true, current_item: contribution.after, ...extra };
};
const intentAck = (args, extra = {}) => {
  const contribution = args.target_cancel ? null : evidence(args);
  return { outcome: 'applied', operation_id: args.target_operation_id, desired_revision: args.target_desired_revision,
    confirmed_revision: args.target_desired_revision, latest_received_revision: args.target_desired_revision,
    replayed: false, contribution, affected_items: contribution ? [contribution.after] : [],
    removed_row_ids: ['row-Milk'], ...extra };
};

function setup(t, handler) {
  const indexedDB = new IDBFactory();
  let currentUser = 'user-a';
  let nextId = 0;
  const journals = [];
  const calls = [];
  const getCurrentUserId = () => currentUser;
  const client = { rpc: async (name, args) => {
    calls.push({ name, args: structuredClone(args) });
    return handler ? handler(name, args, calls.length) : { data: name.endsWith('_v3') ? addAck(args) : intentAck(args) };
  } };
  const make = (wrap = journal => journal) => {
    const journal = createShoppingCreateJournal({ userId: 'user-a', getCurrentUserId, indexedDB });
    journals.push(journal);
    const operations = createShoppingCreateOperations({ journal: wrap(journal), supabaseClient: client,
      getCurrentUserId, createIntentId: () => `intent-${++nextId}` });
    return { journal, operations };
  };
  t.after(() => journals.forEach(journal => journal.close()));
  return { make, calls, switchUser: user => { currentUser = user; } };
}

test('an Open edit before sending compacts into the immutable baseline and settles with one add', async t => {
  const env = setup(t);
  const { operations } = env.make();
  await operations.create(entry);
  await operations.edit(entry.operationId, '0', { title: 'Oat milk', quantityValue: 2 });
  const result = await operations.syncOnce(entry.operationId);
  assert.equal(result.progress.status, 'settled');
  assert.equal(result.progress.confirmedRevision, '1');
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].args.target_title, 'Oat milk');
  assert.deepEqual(result.record.submission.item.meta, entry.item.meta);
  assert.equal((await operations.syncOnce(entry.operationId)).sent, false);
});

test('cancellation before submission persists a tombstone and sends nothing after reopening', async t => {
  const env = setup(t);
  const { operations, journal } = env.make();
  await operations.create(entry);
  await operations.edit(entry.operationId, '0', { cancel: true });
  journal.close();
  const result = await env.make().operations.syncOnce(entry.operationId);
  assert.equal(result.progress.status, 'local_cancelled');
  assert.equal(result.record.submission, null);
  assert.equal(env.calls.length, 0);
});

for (const patch of [{ status: 'Done' }, { title: 'Oat milk', status: 'Done' }]) {
  test(`pre-send completion requires a separate intent: ${JSON.stringify(patch)}`, async t => {
    const env = setup(t);
    const { operations } = env.make();
    await operations.create(entry);
    await operations.edit(entry.operationId, '0', patch);
    const add = await operations.syncOnce(entry.operationId);
    assert.equal(add.progress.status, 'pending_change');
    assert.equal(add.record.submission.baselineRevision, null);
    assert.equal(env.calls[0].args.target_status, undefined);
    const done = await operations.syncOnce(entry.operationId);
    assert.equal(done.progress.status, 'settled');
    assert.equal(env.calls[1].args.target_status, 'Done');
    assert.equal(env.calls[1].args.target_title, patch.title || 'Milk');
  });
}

for (const patch of [{ title: 'Oat milk' }, { cancel: true }]) {
  test(`a later draft survives an in-flight add: ${JSON.stringify(patch)}`, async t => {
    const entered = deferred();
    const release = deferred();
    const env = setup(t, async (name, args) => {
      if (name.endsWith('_v3')) { entered.resolve(); await release.promise; return { data: addAck(args) }; }
      return { data: intentAck(args) };
    });
    const { operations } = env.make();
    await operations.create(entry);
    const sending = operations.syncOnce(entry.operationId);
    await entered.promise;
    await operations.edit(entry.operationId, '0', patch);
    release.resolve();
    const added = await sending;
    assert.equal(added.progress.status, 'pending_change');
    assert.equal(added.record.submission.item.title, 'Milk');
    assert.equal(added.progress.desired.cancel, patch.cancel || false);
    const completed = await operations.syncOnce(entry.operationId);
    assert.equal(completed.progress.status, 'settled');
    assert.equal(env.calls[1].args.target_cancel, patch.cancel || false);
    assert.equal(env.calls[1].args.target_title, patch.title || 'Milk');
  });
}

test('a lost add response replays its saved payload after edit and reopen', async t => {
  const env = setup(t, async (name, args, count) => {
    if (count === 1) throw new Error('response lost');
    return { data: name.endsWith('_v3') ? addAck(args, { outcome: 'already_applied' }) : intentAck(args) };
  });
  const first = env.make();
  await first.operations.create(entry);
  assert.match((await first.operations.syncOnce(entry.operationId)).error.message, /response lost/);
  await first.operations.edit(entry.operationId, '0', { title: 'Oat milk' });
  first.journal.close();
  const reopened = env.make().operations;
  assert.equal((await reopened.syncOnce(entry.operationId)).progress.status, 'pending_change');
  assert.deepEqual(env.calls[1].args, env.calls[0].args);
  assert.equal((await reopened.syncOnce(entry.operationId)).progress.status, 'settled');
  assert.equal(env.calls[2].args.target_title, 'Oat milk');
});

test('intents are committed before transport and lost responses retain their exact IDs and payloads', async t => {
  let inspector;
  let failIntent = true;
  const env = setup(t, async (name, args) => {
    if (name.endsWith('_v3')) return { data: addAck(args) };
    const stored = await inspector.read(entry.operationId);
    const intent = stored.desired.intents.find(value => value.id === args.target_intent_id);
    assert.equal(intent.revision, args.target_desired_revision);
    assert.equal(intent.desired.title, args.target_title);
    if (failIntent) { failIntent = false; throw new Error('intent response lost'); }
    return { data: intentAck(args) };
  });
  const { operations } = env.make();
  inspector = env.make().journal;
  await operations.create(entry);
  // Establish the same frozen boundary as an uncertain first submission.
  const frozen = await operations.read(entry.operationId);
  await inspector.freezeSubmission(entry.operationId, frozen.recordVersion, { item: entry.item, baselineRevision: '0' });
  await operations.edit(entry.operationId, '0', { title: 'Oat milk' });
  await operations.syncOnce(entry.operationId);
  assert.ok((await operations.syncOnce(entry.operationId)).error);
  await operations.edit(entry.operationId, '1', { cancel: true });
  const reopened = env.make().operations;
  assert.equal((await reopened.syncOnce(entry.operationId)).progress.status, 'pending_change');
  assert.deepEqual(env.calls[2].args, env.calls[1].args);
  assert.equal((await reopened.syncOnce(entry.operationId)).progress.status, 'settled');
  assert.equal(env.calls[3].args.target_cancel, true);
  assert.equal(env.calls[3].args.target_desired_revision, '2');
});

async function pendingChange(env) {
  const context = env.make();
  await context.operations.create(entry);
  const record = await context.operations.read(entry.operationId);
  await context.journal.freezeSubmission(entry.operationId, record.recordVersion, { item: entry.item, baselineRevision: '0' });
  await context.operations.edit(entry.operationId, '0', { title: 'Oat milk' });
  await context.operations.syncOnce(entry.operationId);
  return context;
}

test('two controllers adopt one durably prepared intent and do not replace each other’s acknowledgement', async t => {
  const env = setup(t);
  const { operations } = await pendingChange(env);
  const other = env.make().operations;
  const results = await Promise.all([operations.syncOnce(entry.operationId), other.syncOnce(entry.operationId)]);
  const intents = env.calls.filter(call => call.name.endsWith('_v1'));
  assert.ok(intents.length >= 1);
  assert.equal(new Set(intents.map(call => call.args.target_intent_id)).size, 1);
  assert.equal((await operations.read(entry.operationId)).desired.intents.length, 1);
  assert.ok(results.every(result => result.progress.status === 'settled'));
});

test('an older duplicate acknowledgement cannot erase a newer edit or confirmation', async t => {
  const entered = deferred();
  const release = deferred();
  let oldCalls = 0;
  const env = setup(t, async (name, args) => {
    if (name.endsWith('_v3')) return { data: addAck(args) };
    if (args.target_desired_revision === '1' && ++oldCalls === 1) { entered.resolve(); await release.promise; }
    return { data: intentAck(args) };
  });
  const { operations } = await pendingChange(env);
  const delayed = operations.syncOnce(entry.operationId);
  await entered.promise;
  // A newer user edit arrives before a second tab acknowledges revision 1.
  await operations.edit(entry.operationId, '1', { title: 'Bread' });
  const other = env.make().operations;
  assert.equal((await other.syncOnce(entry.operationId)).progress.status, 'pending_change');
  assert.equal((await other.syncOnce(entry.operationId)).progress.confirmedRevision, '2');
  release.resolve();
  const oldResult = await delayed;
  assert.equal(oldResult.progress.status, 'settled');
  assert.equal(oldResult.progress.confirmedRevision, '2');
  assert.equal(oldResult.progress.desired.title, 'Bread');
  assert.equal(oldResult.progress.contribution.after.title, 'Bread');
});

for (const stage of ['add', 'intent']) {
  test(`remote success with a failed local ${stage} acknowledgement remains replayable`, async t => {
    const env = setup(t);
    const base = stage === 'intent' ? await pendingChange(env) : env.make();
    if (stage === 'add') await base.operations.create(entry);
    let failWrite = true;
    const faulty = env.make(journal => ({ ...journal, setDesired: (...args) => {
      const state = args[2];
      if (failWrite && (stage === 'add' ? state.addResult : state.intents.some(intent => intent.result))) {
        failWrite = false;
        throw Object.assign(new Error('storage full'), { code: 'JOURNAL_STORAGE_FAILED' });
      }
      return journal.setDesired(...args);
    } }));
    await assert.rejects(faulty.operations.syncOnce(entry.operationId), { code: 'JOURNAL_STORAGE_FAILED' });
    const uncertain = await base.operations.read(entry.operationId);
    if (stage === 'add') assert.equal(uncertain.desired.addResult, null);
    else assert.equal(uncertain.desired.intents[0].result, null);
    const firstRequest = env.calls.at(-1);
    faulty.journal.close();
    const result = await env.make().operations.syncOnce(entry.operationId);
    assert.equal(result.progress.status, 'settled');
    assert.deepEqual(env.calls.at(-1), firstRequest);
  });
}

for (const outcome of ['needs_review', 'superseded']) {
  test(`${outcome} remains visible without an automatic resend loop`, async t => {
    const env = setup(t, async (name, args) => ({ data: name.endsWith('_v3') ? addAck(args)
      : intentAck(args, { outcome, confirmed_revision: '0' }) }));
    const { operations } = await pendingChange(env);
    const result = await operations.syncOnce(entry.operationId);
    assert.equal(result.progress.status, 'needs_review');
    assert.equal(result.progress.reason, outcome);
    assert.equal(result.progress.desired.title, 'Oat milk');
    assert.equal((await operations.syncOnce(entry.operationId)).sent, false);
    assert.equal(env.calls.length, 2);
  });
}

test('unknown server revisions block settlement; an explicit edit advances beyond them exactly', async t => {
  const serverRevision = '9007199254740993';
  const env = setup(t, async (name, args) => ({ data: name.endsWith('_v3') ? addAck(args)
    : args.target_desired_revision === '1' ? intentAck(args, { outcome: 'superseded', confirmed_revision: '0',
      latest_received_revision: serverRevision, replayed: true, latest_confirmed_revision: serverRevision }) : intentAck(args) }));
  const { operations } = await pendingChange(env);
  const blocked = await operations.syncOnce(entry.operationId);
  assert.equal(blocked.progress.reason, 'unknown_server_revision');
  assert.equal((await operations.syncOnce(entry.operationId)).sent, false);
  const edited = await operations.edit(entry.operationId, '1', { cancel: true });
  assert.equal(edited.desired.revision, '9007199254740994');
  assert.equal((await operations.syncOnce(entry.operationId)).progress.status, 'settled');
  assert.equal(env.calls.at(-1).args.target_desired_revision, '9007199254740994');
});

test('a vanished grocery in add replay is never treated as a current saved item', async t => {
  const env = setup(t, async (_name, args) => ({ data: addAck(args, { outcome: 'already_applied', row_exists: false, current_item: null }) }));
  const { operations } = env.make();
  await operations.create(entry);
  const result = await operations.syncOnce(entry.operationId);
  assert.equal(result.progress.reason, 'missing_grocery');
  assert.equal((await operations.syncOnce(entry.operationId)).sent, false);
});

test('a higher local revision does not bypass a newly discovered unknown server revision', async t => {
  const entered = deferred();
  const release = deferred();
  const env = setup(t, async (name, args) => {
    if (name.endsWith('_v3')) return { data: addAck(args) };
    if (args.target_desired_revision === '1') {
      entered.resolve(); await release.promise;
      return { data: intentAck(args, { replayed: true, latest_confirmed_revision: '2', latest_received_revision: '2' }) };
    }
    return { data: intentAck(args) };
  });
  const { operations } = await pendingChange(env);
  const pending = operations.syncOnce(entry.operationId);
  await entered.promise;
  await operations.edit(entry.operationId, '1', { title: 'Bread' });
  await operations.edit(entry.operationId, '2', { title: 'Apples' });
  release.resolve();
  assert.equal((await pending).progress.reason, 'unknown_server_revision');
  assert.equal((await operations.syncOnce(entry.operationId)).sent, false);
  await operations.edit(entry.operationId, '3', { cancel: true });
  assert.equal((await operations.syncOnce(entry.operationId)).progress.status, 'settled');
  assert.equal(env.calls.at(-1).args.target_desired_revision, '4');
});

test('failed RPC acknowledgement preserves intent and never uses a legacy endpoint', async t => {
  const denied = { code: 'PGRST202', message: 'apply_shopping_list_add_v3 unavailable' };
  const env = setup(t, async () => ({ error: denied }));
  const { operations } = env.make();
  await operations.create(entry);
  const result = await operations.syncOnce(entry.operationId);
  assert.equal(result.error, denied);
  assert.equal(result.record.desired.addResult, null);
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].name, 'apply_shopping_list_add_v3');
});

test('an account change while a response is delayed prevents acknowledgement persistence', async t => {
  const entered = deferred();
  const release = deferred();
  const env = setup(t, async (_name, args) => { entered.resolve(); await release.promise; return { data: addAck(args) }; });
  const { operations } = env.make();
  await operations.create(entry);
  const pending = operations.syncOnce(entry.operationId);
  await entered.promise;
  env.switchUser('user-b');
  release.resolve();
  await assert.rejects(pending, { code: 'JOURNAL_OWNER_CHANGED' });
  env.switchUser('user-a');
  assert.equal((await env.make().operations.read(entry.operationId)).desired.addResult, null);
});

test('an account change after durable preparation blocks dispatch', async t => {
  const env = setup(t);
  const { operations } = env.make(journal => ({ ...journal, freezeSubmission: async (...args) => {
    const record = await journal.freezeSubmission(...args);
    env.switchUser('user-b');
    return record;
  } }));
  await operations.create(entry);
  await assert.rejects(operations.syncOnce(entry.operationId), { code: 'JOURNAL_OWNER_CHANGED' });
  assert.equal(env.calls.length, 0);
});

test('stale competing edits are rejected rather than silently replacing a newer desired draft', async t => {
  const env = setup(t);
  const first = env.make().operations;
  const second = env.make().operations;
  await first.create(entry);
  const results = await Promise.allSettled([first.edit(entry.operationId, '0', { title: 'Bread' }),
    second.edit(entry.operationId, '0', { cancel: true })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'SHOPPING_DESIRED_CONFLICT');
  assert.equal((await first.read(entry.operationId)).desired.revision, '1');
});

test('settled records and invalid edits cannot be silently reused as pending creates', async t => {
  const env = setup(t);
  const { operations } = env.make();
  await operations.create(entry);
  assert.throws(() => operations.edit(entry.operationId, '0', { projectId: 'other-project' }), { code: 'SHOPPING_DRAFT_INVALID' });
  await assert.rejects(operations.edit(entry.operationId, '0', { title: '' }), { code: 'SHOPPING_DRAFT_INVALID' });
  await assert.rejects(operations.edit(entry.operationId, '0', { quantityValue: -1 }), { code: 'SHOPPING_DRAFT_INVALID' });
  await operations.syncOnce(entry.operationId);
  await assert.rejects(operations.edit(entry.operationId, '0', { cancel: true }), { code: 'SHOPPING_OPERATION_SETTLED' });
  assert.throws(() => shoppingCreateProgress({ desired: { protocolVersion: 0 } }), { code: 'SHOPPING_OPERATION_INVALID' });
});

for (const corruption of ['invalid_add', 'wrong_owner', 'wrong_intent_revision', 'receipt_without_submission']) {
  test(`recovery rejects malformed durable evidence without sending: ${corruption}`, async t => {
    const env = setup(t);
    const { operations, journal } = await pendingChange(env);
    await operations.syncOnce(entry.operationId);
    const saved = await journal.read(entry.operationId);
    if (corruption === 'invalid_add') saved.desired.addResult = { confirmed_revision: '0', row_exists: true, contribution: null };
    if (corruption === 'wrong_owner') saved.desired.addResult.user_id = 'user-b';
    if (corruption === 'wrong_intent_revision') saved.desired.intents[0].result.desired_revision = '2';
    if (corruption === 'receipt_without_submission') {
      const fresh = env.make().journal;
      await fresh.create({ ...entry, operationId: 'corrupt-op', localId: 'corrupt-local', desired: saved.desired });
      const count = env.calls.length;
      await assert.rejects(operations.syncOnce('corrupt-op'), { code: 'SHOPPING_OPERATION_INVALID' });
      assert.equal(env.calls.length, count);
      return;
    }
    await journal.setDesired(entry.operationId, saved.recordVersion, saved.desired);
    const count = env.calls.length;
    await assert.rejects(env.make().operations.syncOnce(entry.operationId), { code: 'SHOPPING_OPERATION_INVALID' });
    assert.equal(env.calls.length, count);
  });
}

test('newer add replay missing-row evidence is retained after a known applied intent', async t => {
  const env = setup(t);
  const { operations, journal } = await pendingChange(env);
  await operations.syncOnce(entry.operationId);
  const saved = await journal.read(entry.operationId);
  const contribution = saved.desired.intents[0].result.contribution;
  await journal.setDesired(entry.operationId, saved.recordVersion, { ...saved.desired, addResult: {
    ...saved.desired.addResult, outcome: 'already_applied', confirmed_revision: '1', contribution,
    row_exists: false, current_item: null,
  } });
  assert.equal((await operations.syncOnce(entry.operationId)).progress.reason, 'missing_grocery');
});

test('an older duplicate add response cannot replace a newer intent confirmation', async t => {
  const entered = deferred();
  const release = deferred();
  let adds = 0;
  const env = setup(t, async (name, args) => {
    if (name.endsWith('_v3')) {
      if (++adds === 1) { entered.resolve(); await release.promise; }
      return { data: addAck(args) };
    }
    return { data: intentAck(args) };
  });
  const first = env.make().operations;
  await first.create(entry);
  const old = first.syncOnce(entry.operationId);
  await entered.promise;
  await first.edit(entry.operationId, '0', { title: 'Bread' });
  const other = env.make().operations;
  await other.syncOnce(entry.operationId);
  await other.syncOnce(entry.operationId);
  release.resolve();
  const result = await old;
  assert.equal(result.progress.status, 'settled');
  assert.equal(result.progress.confirmedRevision, '1');
  assert.equal(result.progress.contribution.after.title, 'Bread');
});

test('exhausted observed revision refuses an edit without losing the draft', async t => {
  const env = setup(t, async (name, args) => ({ data: name.endsWith('_v3') ? addAck(args)
    : intentAck(args, { outcome: 'superseded', confirmed_revision: '0', latest_received_revision: '9223372036854775807' }) }));
  const { operations } = await pendingChange(env);
  await operations.syncOnce(entry.operationId);
  await assert.rejects(operations.edit(entry.operationId, '1', { cancel: true }), { code: 'SHOPPING_REVISION_EXHAUSTED' });
  assert.equal((await operations.read(entry.operationId)).desired.draft.cancel, false);
});

test('an edit CAS retry does not implicitly review a server revision discovered after the edit began', async t => {
  const enteredRpc = deferred();
  const releaseRpc = deferred();
  const enteredEdit = deferred();
  const releaseEdit = deferred();
  const env = setup(t, async (name, args) => {
    if (name.endsWith('_v3')) return { data: addAck(args) };
    if (args.target_desired_revision === '1') {
      enteredRpc.resolve(); await releaseRpc.promise;
      return { data: intentAck(args, { replayed: true, latest_received_revision: '2', latest_confirmed_revision: '2' }) };
    }
    return { data: intentAck(args) };
  });
  const { operations } = await pendingChange(env);
  const pending = operations.syncOnce(entry.operationId);
  await enteredRpc.promise;
  let held = false;
  const editing = env.make(journal => ({ ...journal, setDesired: async (...args) => {
    if (!held) { held = true; enteredEdit.resolve(); await releaseEdit.promise; }
    return journal.setDesired(...args);
  } })).operations;
  const edit = editing.edit(entry.operationId, '1', { title: 'Bread' });
  await enteredEdit.promise;
  releaseRpc.resolve();
  assert.equal((await pending).progress.reason, 'unknown_server_revision');
  releaseEdit.resolve();
  const saved = await edit;
  assert.equal(saved.desired.revision, '3');
  assert.equal(saved.desired.reviewedServerRevision, '0');
  assert.equal((await editing.syncOnce(entry.operationId)).sent, false);
  await editing.edit(entry.operationId, '3', { cancel: true });
  assert.equal((await editing.syncOnce(entry.operationId)).progress.status, 'settled');
});
