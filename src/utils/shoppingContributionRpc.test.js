import test from 'node:test';
import assert from 'node:assert/strict';
import { applyShoppingContribution, isMissingShoppingContributionRpc, reconcileShoppingContribution } from './shoppingContributionRpc.js';

const evidence = { kind: 'inserted', row_id: 'row-a', revision: '9007199254740993', before: null,
  after: { id: 'row-a', project_id: 'project-a', title: 'Milk' } };
const added = { outcome: 'applied', operation_id: 'op-a', project_id: 'project-a', user_id: 'user-a',
  confirmed_revision: '0', contribution: evidence, row_exists: true, current_item: evidence.after };
const reconciled = { outcome: 'applied', operation_id: 'op-a', desired_revision: '1', confirmed_revision: '1',
  latest_received_revision: '1', replayed: false, contribution: null, affected_items: [], removed_row_ids: ['row-a'] };
const addOptions = { operationId: 'op-a', projectId: 'project-a', userId: 'user-a', item: { title: 'Milk', quantityValue: 1 } };
const intentOptions = { operationId: 'op-a', projectId: 'project-a', intentId: 'intent-a', desiredRevision: '1', desired: { cancel: true } };
const stub = response => {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); if (response instanceof Error) throw response; return response; } };
};

test('add passes explicit identity/payload and retains exact large revisions', async () => {
  const client = stub({ data: added });
  const result = await applyShoppingContribution({ ...addOptions, supabaseClient: client });
  assert.equal(result.error, null);
  assert.equal(result.data.contribution.revision, '9007199254740993');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, 'apply_shopping_list_add_v3');
  assert.equal(client.calls[0].args.target_operation_id, 'op-a');
  assert.equal(client.calls[0].args.target_quantity_value, 1);
});

for (const change of [
  { operation_id: 'other-op' }, { project_id: 'other-project' }, { user_id: 'other-user' },
  { confirmed_revision: 0 }, { confirmed_revision: '01' }, { outcome: 'unknown' },
  { row_exists: false }, { current_item: { id: 'other-row', project_id: 'project-a' } },
  { contribution: null }, { contribution: { ...evidence, revision: '1.5' } },
  { contribution: { ...evidence, before: {} } },
]) {
  test(`invalid add acknowledgement is rejected: ${JSON.stringify(change)}`, async () => {
    const result = await applyShoppingContribution({ ...addOptions, supabaseClient: stub({ data: { ...added, ...change } }) });
    assert.equal(result.data, null);
    assert.equal(result.error.code, 'SHOPPING_ACK_INVALID');
  });
}

test('a replay may truthfully report a missing row or a cancelled contribution', async () => {
  for (const contribution of [evidence, null]) {
    const result = await applyShoppingContribution({ ...addOptions, supabaseClient: stub({ data: {
      ...added, outcome: 'already_applied', confirmed_revision: '2', contribution, row_exists: false, current_item: null,
    } }) });
    assert.equal(result.error, null);
    assert.equal(result.data.current_item, null);
  }
});

test('missing RPC, permission failure and thrown transport error never fall back', async () => {
  for (const error of [
    { code: 'PGRST202', message: 'Could not find function public.apply_shopping_list_add_v3' },
    { code: 'P0001', message: 'PROJECT_ACCESS_REQUIRED' },
    new Error('Network lost'),
  ]) {
    const client = stub(error instanceof Error ? error : { data: null, error });
    const result = await applyShoppingContribution({ ...addOptions, supabaseClient: client });
    assert.equal(result.error, error);
    assert.equal(result.data, null);
    assert.equal(client.calls.length, 1);
  }
});

test('missing-capability classification requires the right code and function name', () => {
  assert.equal(isMissingShoppingContributionRpc({ code: 'PGRST202', message: 'public.reconcile_shopping_contribution_v1' }), true);
  assert.equal(isMissingShoppingContributionRpc({ code: '42501', message: 'apply_shopping_list_add_v3 permission denied' }), false);
  assert.equal(isMissingShoppingContributionRpc({ code: '42883', message: 'unrelated_function' }), false);
  assert.equal(isMissingShoppingContributionRpc({ message: 'manual_todos' }), false);
});

test('empty and multiple acknowledgements cannot clear an operation', async () => {
  for (const data of [null, [], [added, added]]) {
    const result = await applyShoppingContribution({ ...addOptions, supabaseClient: stub({ data }) });
    assert.equal(result.data, null);
    assert.equal(result.error.code, 'SHOPPING_ACK_INVALID');
  }
});

test('reconciliation transports revision strings without rounding', async () => {
  const revision = '9007199254740993';
  const client = stub({ data: { ...reconciled, desired_revision: revision, confirmed_revision: revision, latest_received_revision: revision } });
  const result = await reconcileShoppingContribution({ ...intentOptions, desiredRevision: revision, supabaseClient: client });
  assert.equal(result.error, null);
  assert.equal(client.calls[0].args.target_desired_revision, revision);
  assert.equal(client.calls[0].name, 'reconcile_shopping_contribution_v1');
});

test('needs_review and superseded remain distinct from applied', async () => {
  for (const outcome of ['needs_review', 'superseded']) {
    const result = await reconcileShoppingContribution({ ...intentOptions, supabaseClient: stub({ data: {
      outcome, operation_id: 'op-a', desired_revision: '1', confirmed_revision: '0', latest_received_revision: '3', replayed: false,
    } }) });
    assert.equal(result.error, null);
    assert.equal(result.data.outcome, outcome);
    assert.equal(result.data.confirmed_revision, '0');
  }
});

test('historical replay keeps its original confirmation and newer server revisions', async () => {
  const result = await reconcileShoppingContribution({ ...intentOptions, supabaseClient: stub({ data: {
    ...reconciled, replayed: true, latest_confirmed_revision: '3', latest_received_revision: '4',
  } }) });
  assert.equal(result.error, null);
  assert.equal(result.data.confirmed_revision, '1');
  assert.equal(result.data.latest_confirmed_revision, '3');
  assert.equal(result.data.replayed, true);
});

for (const change of [
  { operation_id: 'other-op' }, { desired_revision: '2' }, { confirmed_revision: '0' },
  { latest_received_revision: '0' }, { replayed: true }, { contribution: evidence },
  { affected_items: [{ id: 'row-a', project_id: 'other-project' }] }, { removed_row_ids: null },
]) {
  test(`invalid reconciliation acknowledgement is rejected: ${JSON.stringify(change)}`, async () => {
    const result = await reconcileShoppingContribution({ ...intentOptions, supabaseClient: stub({ data: { ...reconciled, ...change } }) });
    assert.equal(result.data, null);
    assert.equal(result.error.code, 'SHOPPING_ACK_INVALID');
  });
}

test('invalid intent identity prevents network calls', async () => {
  const client = stub({ data: reconciled });
  for (const desiredRevision of ['0', '-1', '1.0', 1, '9223372036854775808']) {
    const result = await reconcileShoppingContribution({ ...intentOptions, desiredRevision, supabaseClient: client });
    assert.equal(result.data, null);
  }
  assert.equal(client.calls.length, 0);
});
