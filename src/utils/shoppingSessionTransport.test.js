import test from 'node:test';
import assert from 'node:assert/strict';
import { createShoppingSessionTransport } from './shoppingSessionTransport.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const session = { data: { session: { user: { id: 'owner' }, access_token: 'synthetic-owner-token' } } };
function setup(overrides = {}) {
  let owner = 'owner';
  const abort = new AbortController();
  const requests = [];
  const transport = createShoppingSessionTransport({ userId: 'owner', getCurrentUserId: () => owner,
    url: 'https://database.example.test', anonKey: 'synthetic-public-key', signal: abort.signal,
    supabaseClient: { auth: { getSession: async () => session } },
    fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ confirmed: true }) }; },
    ...overrides });
  return { transport, requests, abort, switchOwner: value => { owner = value; } };
}

test('Shopping dispatch pins a verified owner token and cannot call a legacy RPC', async () => {
  const fixture = setup();
  assert.equal((await fixture.transport.rpc('apply_shopping_list_add_v3', { target_title: 'Milk' })).error, null);
  assert.equal(fixture.requests[0].options.headers.Authorization, 'Bearer synthetic-owner-token');
  assert.equal(fixture.requests[0].url, 'https://database.example.test/rest/v1/rpc/apply_shopping_list_add_v3');
  assert.ok((await fixture.transport.rpc('apply_shopping_list_add_v2', {})).error);
  assert.equal(fixture.requests.length, 1);
});

test('changing owners during session acquisition prevents HTTP dispatch', async () => {
  const gate = deferred();
  const fixture = setup({ supabaseClient: { auth: { getSession: () => gate.promise } } });
  const pending = fixture.transport.rpc('apply_shopping_list_add_v3', {});
  fixture.switchOwner('other'); gate.resolve(session);
  assert.equal((await pending).error.code, 'JOURNAL_OWNER_CHANGED');
  assert.equal(fixture.requests.length, 0);
});

test('a mismatched captured session never dispatches even when the UI owner is unchanged', async () => {
  const fixture = setup({ supabaseClient: { auth: { getSession: async () => ({ data: { session: {
    user: { id: 'other' }, access_token: 'synthetic-other-token' } } }) } } });
  assert.equal((await fixture.transport.rpc('apply_shopping_list_add_v3', {})).error.code, 'JOURNAL_OWNER_CHANGED');
  assert.equal(fixture.requests.length, 0);
});

test('closing the session permanently fences A to B to A recovery', async () => {
  const fixture = setup(); fixture.switchOwner('other'); fixture.abort.abort(); fixture.switchOwner('owner');
  assert.equal((await fixture.transport.rpc('apply_shopping_list_add_v3', {})).error.code, 'JOURNAL_OWNER_CHANGED');
  assert.equal(fixture.requests.length, 0);
});

test('a response arriving after close is rejected', async () => {
  const entered = deferred(), release = deferred();
  const fixture = setup({ fetchImpl: async () => { entered.resolve(); await release.promise; return { ok: true, json: async () => ({}) }; } });
  const pending = fixture.transport.rpc('apply_shopping_list_add_v3', {});
  await entered.promise; fixture.abort.abort(); release.resolve();
  assert.equal((await pending).error.code, 'JOURNAL_OWNER_CHANGED');
});

test('current-list refresh is project-scoped and rejects rows from another list', async () => {
  let target;
  const fixture = setup({ fetchImpl: async url => { target = new URL(url); return { ok: true,
    json: async () => [{ id: 'row', project_id: 'other-project' }] }; } });
  await assert.rejects(fixture.transport.readProject('project-a'));
  assert.equal(target.searchParams.get('project_id'), 'eq.project-a');
});
