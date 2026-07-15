import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isMissingShoppingAddV2RpcError,
  upsertShoppingListItem,
} from './shoppingListRpc.js';

const createSupabaseRpcStub = (responses) => {
  const calls = [];
  return {
    calls,
    client: {
      rpc: async (name, payload) => {
        calls.push({ name, payload });
        return responses[calls.length - 1] || { data: null, error: null };
      },
    },
  };
};

test('isMissingShoppingAddV2RpcError recognizes missing v2 RPC responses', () => {
  assert.equal(isMissingShoppingAddV2RpcError({ code: '42883' }), true);
  assert.equal(isMissingShoppingAddV2RpcError({ message: 'function apply_shopping_list_add_v2 does not exist' }), true);
  assert.equal(isMissingShoppingAddV2RpcError({ message: 'permission denied' }), false);
});

test('upsertShoppingListItem uses v2 when an operation id is available', async () => {
  const { calls, client } = createSupabaseRpcStub([
    { data: { id: 'todo-1', title: 'Oats' }, error: null },
  ]);

  const result = await upsertShoppingListItem({
    supabaseClient: client,
    projectId: 'project-1',
    operationId: '11111111-1111-4111-8111-111111111111',
    item: { title: 'Oats', quantityValue: 500, quantityUnit: 'g' },
  });

  assert.equal(result.usedV2, true);
  assert.equal(result.data.id, 'todo-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'apply_shopping_list_add_v2');
  assert.equal(calls[0].payload.target_operation_id, '11111111-1111-4111-8111-111111111111');
});

test('upsertShoppingListItem falls back to the legacy RPC when v2 is not installed yet', async () => {
  const { calls, client } = createSupabaseRpcStub([
    { data: null, error: { code: '42883', message: 'missing function' } },
    { data: { id: 'todo-legacy', title: 'Milk' }, error: null },
  ]);

  const result = await upsertShoppingListItem({
    supabaseClient: client,
    projectId: 'project-1',
    operationId: '22222222-2222-4222-8222-222222222222',
    item: { title: 'Milk' },
  });

  assert.equal(result.usedV2, false);
  assert.equal(result.data.id, 'todo-legacy');
  assert.deepEqual(calls.map((call) => call.name), [
    'apply_shopping_list_add_v2',
    'upsert_shopping_list_item',
  ]);
});

test('upsertShoppingListItem does not fall back for real v2 failures', async () => {
  const { calls, client } = createSupabaseRpcStub([
    { data: null, error: { message: 'permission denied' } },
  ]);

  const result = await upsertShoppingListItem({
    supabaseClient: client,
    projectId: 'project-1',
    operationId: '33333333-3333-4333-8333-333333333333',
    item: { title: 'Eggs' },
  });

  assert.equal(result.usedV2, true);
  assert.equal(result.data, null);
  assert.equal(result.error.message, 'permission denied');
  assert.equal(calls.length, 1);
});

test('upsertShoppingListItem uses the legacy RPC when there is no operation id', async () => {
  const { calls, client } = createSupabaseRpcStub([
    { data: { id: 'todo-legacy', title: 'Bread' }, error: null },
  ]);

  const result = await upsertShoppingListItem({
    supabaseClient: client,
    projectId: 'project-1',
    item: { title: 'Bread' },
  });

  assert.equal(result.usedV2, false);
  assert.equal(result.data.id, 'todo-legacy');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'upsert_shopping_list_item');
});
