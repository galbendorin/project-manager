import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createShoppingOwnerClient } from './shoppingOwnerClient.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const session = () => ({ data: { session: { user: { id: 'owner' }, access_token: 'synthetic-owner-token' } } });
const createClientImpl = (url, key, options) => createClient(url, key, { ...options,
  realtime: { transport: class UnusedWebSocket { constructor() { throw new Error('No realtime connection in this test'); } } } });
function fixture(overrides = {}) {
  let active = true;
  const requests = [], abort = new AbortController();
  const options = { supabaseClient: { auth: { getSession: async () => session() } }, userId: 'owner',
    isCurrent: () => active, url: 'https://shopping.example.test', anonKey: 'synthetic-public-key', signal: abort.signal,
    createClientImpl, fetchImpl: async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(JSON.stringify([{ id: 'item' }]), { headers: { 'content-type': 'application/json' } });
    }, ...overrides };
  return { options, requests, abort, close: () => { active = false; } };
}

test('legacy Shopping table writes and RPC calls dispatch with the captured owner token', async () => {
  const value = session();
  const f = fixture({ supabaseClient: { auth: { getSession: async () => value } } });
  const client = await createShoppingOwnerClient(f.options);
  value.data.session = { user: { id: 'other' }, access_token: 'synthetic-other-token' };
  assert.equal((await client.from('manual_todos').update({ title: 'Q09 TEST' }).eq('id', 'item').select('id').maybeSingle()).error, null);
  assert.equal((await client.rpc('apply_shopping_list_add_v2', { target_title: 'Q09 TEST' })).error, null);
  assert.equal(f.requests.length, 2);
  for (const request of f.requests) {
    assert.equal(new Headers(request.init.headers).get('Authorization'), 'Bearer synthetic-owner-token');
    assert.equal(request.init.signal, f.abort.signal);
  }
});

test('changing owner while acquiring a token prevents any dispatch', async () => {
  const gate = deferred();
  const f = fixture({ supabaseClient: { auth: { getSession: () => gate.promise } } });
  const pending = createShoppingOwnerClient(f.options);
  f.close(); gate.resolve(session());
  await assert.rejects(pending, { code: 'SHOPPING_OWNER_CHANGED' });
  assert.equal(f.requests.length, 0);
});

test('a mismatched session cannot be used even before the UI changes', async () => {
  const value = session(); value.data.session.user.id = 'other';
  const f = fixture({ supabaseClient: { auth: { getSession: async () => value } } });
  await assert.rejects(createShoppingOwnerClient(f.options), { code: 'SHOPPING_OWNER_CHANGED' });
  assert.equal(f.requests.length, 0);
});

test('revoking a constructed client stops later table writes', async () => {
  const f = fixture(); const client = await createShoppingOwnerClient(f.options);
  f.close();
  const result = await client.from('manual_todos').delete().eq('id', 'item');
  assert.ok(result.error);
  assert.equal(f.requests.length, 0);
});

test('a response arriving after cancellation cannot be accepted', async () => {
  const entered = deferred(), release = deferred();
  const f = fixture({ fetchImpl: async () => { entered.resolve(); await release.promise;
    return new Response('[]', { headers: { 'content-type': 'application/json' } }); } });
  const client = await createShoppingOwnerClient(f.options);
  const pending = client.from('manual_todos').select('id').then(result => result);
  await entered.promise; f.abort.abort(); release.resolve();
  assert.ok((await pending).error);
});
