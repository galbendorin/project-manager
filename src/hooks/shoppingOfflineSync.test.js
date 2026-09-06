import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createClient } from '@supabase/supabase-js';
import { SHOPPING_MANUAL_TODO_SELECT, mapManualTodoRow } from './projectData/manualTodoUtils.js';
import { isLikelyNetworkError } from '../utils/connectivity.js';
import * as shoppingViewState from '../utils/shoppingListViewState.js';

// Exercise the real hook and Supabase request/response parsing without mounting
// React, using a household account, or contacting a database.
const source = (await readFile(new URL('./useShoppingListOfflineSync.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
  .replace('export function useShoppingListOfflineSync', 'function useShoppingListOfflineSync');

const projectId = 'project-test';
const targetId = 'item-test';
const previousSync = '2026-01-01T12:00:00.000Z';
const operation = {
  kind: 'update',
  targetId,
  patch: { title: 'Oat milk', quantityValue: 2, quantityUnit: 'cartons' },
};
const laterOperation = { kind: 'update', targetId: 'item-later', patch: { status: 'Done' } };

function setup({ replies, queue = [operation] }) {
  const serverTodos = [{ id: targetId, project_id: projectId, title: 'Milk', status: 'Open' }];
  let cache = {
    queue: structuredClone(queue),
    todosByProject: { [projectId]: serverTodos.map(mapManualTodoRow) },
    lastSyncedAt: previousSync,
  };
  const state = { failedId: '', failedMessage: '', busy: false, visibleTodos: [] };
  const requests = [];
  let responseIndex = 0;
  const supabase = createClient('https://shopping-test.invalid', 'synthetic-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (url, options) => {
        const request = { url: new URL(url), method: options.method, headers: new Headers(options.headers) };
        requests.push(request);
        assert.equal(request.url.pathname, '/rest/v1/manual_todos');
        if (request.method === 'PATCH') {
          const reply = replies[responseIndex++];
          assert.ok(reply, 'Unexpected additional update request');
          request.body = JSON.parse(options.body);
          return new Response(JSON.stringify(reply.body), {
            status: reply.status || 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        assert.equal(request.method, 'GET');
        return new Response(JSON.stringify(serverTodos), { headers: { 'content-type': 'application/json' } });
      },
    },
  });
  const unexpectedCreate = () => { throw new Error('An update must never create a replacement item'); };
  const context = vm.createContext({
    useCallback: (callback) => callback,
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useRef: (current) => ({ current }),
    useState: (initial) => [initial, (value) => { state.busy = value; }],
    supabase,
    SHOPPING_MANUAL_TODO_SELECT,
    mapManualTodoRow,
    isLikelyNetworkError,
    ...shoppingViewState,
    notifyShoppingListSubscribers: unexpectedCreate,
    replaceQueuedTargetId: unexpectedCreate,
    upsertShoppingListItem: unexpectedCreate,
    isMissingShoppingUpsertRpcError: unexpectedCreate,
  });
  const hook = vm.runInContext(`${source}\nuseShoppingListOfflineSync`, context);
  const render = () => hook({
    currentUserId: 'user-test',
    isOnline: true,
    selectedProjectId: projectId,
    loadShoppingOfflineState: () => structuredClone(cache),
    persistOfflineState: (next) => { cache = structuredClone(next); },
    setTodos: (next) => { state.visibleTodos = next; },
    sortTodos: (items) => items,
    offlineQueue: cache.queue,
    lastSyncedAt: cache.lastSyncedAt,
    todos: cache.todosByProject[projectId],
    failedTodoId: state.failedId,
    failedTodoMessage: state.failedMessage,
    setFailedTodoId: (next) => { state.failedId = next; },
    setFailedTodoMessage: (next) => { state.failedMessage = next; },
    retryTodoAction: () => {},
    formatSyncTimeLabel: (value) => value,
  });
  return { render, state, requests, getCache: () => cache };
}

function assertRetained(runtime, expectedQueue) {
  assert.deepEqual(runtime.getCache().queue, expectedQueue);
  assert.equal(runtime.getCache().lastSyncedAt, previousSync);
  assert.equal(runtime.state.failedId, targetId);
  assert.equal(runtime.state.busy, false);
  assert.equal(runtime.requests.filter((request) => request.method === 'PATCH').length, 1);
}

test('queued update requires the server to return the matching item ID', async () => {
  const runtime = setup({ replies: [{ body: [{ id: targetId }] }] });
  await runtime.render().retryShoppingSync();
  assert.deepEqual(runtime.getCache().queue, []);
  assert.ok(Date.parse(runtime.getCache().lastSyncedAt) > Date.parse(previousSync));
  assert.equal(runtime.state.failedId, '');
  assert.equal(runtime.state.busy, false);
  const [request] = runtime.requests;
  assert.equal(request.url.searchParams.get('id'), `eq.${targetId}`);
  assert.equal(request.url.searchParams.get('select'), 'id');
  assert.match(request.headers.get('prefer'), /return=representation/);
  assert.equal(request.body.title, 'Oat milk');
  assert.equal(request.body.quantity_value, 2);
});

test('zero affected rows keep this edit and later edits queued with a useful retry state', async () => {
  const queue = [operation, laterOperation];
  const runtime = setup({ replies: [{ body: [] }], queue });
  await runtime.render().retryShoppingSync();
  assertRetained(runtime, queue);
  assert.match(runtime.state.failedMessage, /could not confirm/i);
  assert.match(runtime.state.failedMessage, /still queued/i);
  assert.equal(runtime.state.visibleTodos[0].title, 'Oat milk');
  const failedItem = runtime.render().syncCenterItems.find((item) => item.id === 'failed');
  assert.equal(failedItem.status, 'error');
  assert.equal(failedItem.actionLabel, 'Retry saved changes');
  assert.equal(failedItem.detail, runtime.state.failedMessage);
});

test('an acknowledgement for another item cannot discard the queued edit', async () => {
  const runtime = setup({ replies: [{ body: [{ id: 'different-item' }] }] });
  await runtime.render().retryShoppingSync();
  assertRetained(runtime, [operation]);
  assert.match(runtime.state.failedMessage, /could not confirm/i);
});

test('an explicit backend failure keeps pending work and the previous sync time', async () => {
  const queue = [operation, laterOperation];
  const runtime = setup({ replies: [{ status: 403, body: { message: 'Permission denied', code: '42501' } }], queue });
  await runtime.render().retryShoppingSync();
  assertRetained(runtime, queue);
  assert.equal(runtime.state.failedMessage, 'Permission denied');
});

test('retry after an empty acknowledgement sends the retained edit and clears the failure on success', async () => {
  const runtime = setup({ replies: [{ body: [] }, { body: [{ id: targetId }] }] });
  const initialHook = runtime.render();
  await initialHook.retryShoppingSync();
  assertRetained(runtime, [operation]);
  await initialHook.retryShoppingSync();
  assert.deepEqual(runtime.getCache().queue, []);
  assert.equal(runtime.state.failedId, '');
  assert.equal(runtime.state.failedMessage, '');
  assert.ok(Date.parse(runtime.getCache().lastSyncedAt) > Date.parse(previousSync));
  const updates = runtime.requests.filter((request) => request.method === 'PATCH');
  assert.equal(updates.length, 2);
  assert.equal(updates[1].body.title, 'Oat milk');
});
