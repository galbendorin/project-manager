import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('./pushNotifications.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]+\n/gm, '').replaceAll('export const ', 'const ');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const gate = deferred(), calls = [];
  const notify = vm.runInNewContext(`${source}\nnotifyShoppingListSubscribers`, {
    supabase: { auth: { getSession: () => gate.promise } }, fetch: async (...args) => { calls.push(args); },
  });
  return { notify, calls, release: (id = 'a') => gate.resolve({ data: { session: { user: { id }, access_token: 'synthetic-token' } } }) };
}

test('queued-add notification cannot acquire the replacement account token', async () => {
  const f = fixture();
  const pending = f.notify({ projectId: 'p', itemTitles: ['Q09 TEST'], expectedUserId: 'a' });
  f.release('b'); await pending;
  assert.equal(f.calls.length, 0);
});

test('a new same-account lineage cannot send the old queued-add notification', async () => {
  const f = fixture(); let active = true;
  const pending = f.notify({ projectId: 'p', itemTitles: ['Q09 TEST'], expectedUserId: 'a', isCurrent: () => active });
  active = false; f.release(); await pending;
  assert.equal(f.calls.length, 0);
});

test('a current queued-add notification retains its existing payload and bearer', async () => {
  const f = fixture();
  const pending = f.notify({ projectId: 'p', itemTitles: ['Q09 TEST'], expectedUserId: 'a', isCurrent: () => true });
  f.release(); await pending;
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1].headers.Authorization, 'Bearer synthetic-token');
  assert.deepEqual(JSON.parse(f.calls[0][1].body), { projectId: 'p', itemTitles: ['Q09 TEST'], eventType: 'added' });
});
