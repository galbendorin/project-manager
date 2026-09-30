import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('./useProjectHomeLoading.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]+\n/, '').replace('export function ', 'function ');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const project = { id: 'one', name: 'Test project' };
function fixture() {
  let cursor = 0, userId = 'a';
  const slots = [], effects = [], requests = [], waits = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (factory, deps) => { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: factory() }; return slots[i].value; };
  const queryProjects = () => { const pending = deferred(); requests.push(pending); return pending.promise; };
  const normalizeProject = value => value;
  const hook = vm.runInNewContext(`${source}\nuseProjectHomeLoading`, {
    setTimeout: callback => waits.push(callback),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: value => { const i = cursor++; return slots[i] ||= { current: value }; },
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => { const i = cursor++; if (!same(slots[i]?.deps, deps)) {
      const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
  });
  return { render() { cursor = 0; return hook({ userId, queryProjects, normalizeProject }); },
    start() { this.render(); effects.splice(0).forEach(fn => fn()); },
    switchUser(value) { userId = value; }, close() { slots.forEach(slot => slot?.cleanup?.()); },
    requests, waits };
}
for (const response of [{ data: null, error: { message: 'Failed' } }, { data: null, error: null }, undefined]) {
  test(`failed or missing project result remains a load error after one cold retry: ${JSON.stringify(response)}`, async () => {
    const f = fixture(); f.start(); f.requests[0].resolve(response); await tick();
    assert.equal(f.render().loadingMessage, 'Retrying connection...');
    f.waits.shift()(); await tick(); assert.equal(f.requests.length, 2);
    f.requests[1].resolve(response); await tick();
    assert.equal(f.render().loading, false); assert.match(f.render().error, /could not load/);
  });
}
test('a successful empty response is distinct and does not cold-retry', async () => {
  const f = fixture(); f.start(); f.requests[0].resolve({ data: [], error: null }); await tick();
  assert.equal(f.render().error, ''); assert.equal(f.render().loading, false);
  assert.equal(f.render().projects.length, 0); assert.equal(f.waits.length, 0);
});
test('manual retry clears error after success and refresh failure retains last loaded projects', async () => {
  const f = fixture(); const first = f.render().fetchProjects(true);
  f.requests[0].resolve({ data: null, error: { message: 'Failed' } }); await first;
  const retry = f.render().fetchProjects(true); assert.equal(f.render().loading, true);
  f.requests[1].resolve({ data: [project] }); await retry;
  assert.equal(f.render().error, ''); assert.equal(f.render().projects[0].id, 'one');
  const refresh = f.render().fetchProjects(true); assert.equal(f.render().projects[0].id, 'one');
  f.requests[2].resolve({ error: { message: 'Failed refresh' } }); await refresh;
  assert.equal(f.render().projects[0].id, 'one'); assert.match(f.render().error, /could not load/);
});
test('older completion cannot replace a newer retry result', async () => {
  const f = fixture(); const old = f.render().fetchProjects(true), fresh = f.render().fetchProjects(true);
  f.requests[1].resolve({ data: [project] }); await fresh;
  f.requests[0].resolve({ error: { message: 'Old failure' } }); await old;
  assert.equal(f.render().error, ''); assert.equal(f.render().projects[0].id, 'one');
});
test('account replacement hides former projects immediately and rejects held responses', async () => {
  const f = fixture(); const load = f.render().fetchProjects(true);
  f.requests[0].resolve({ data: [project] }); await load;
  const oldCallback = f.render().fetchProjects, old = oldCallback(true);
  f.switchUser('b'); assert.equal(f.render().projects.length, 0);
  f.start(); f.requests[1].resolve({ data: [project] }); await old;
  assert.equal(f.render().projects.length, 0);
  await oldCallback(true); assert.equal(f.requests.length, 3);
  f.requests[2].resolve({ data: [] }); await tick(); assert.equal(f.render().error, '');
});
test('unmount during cold retry delay prevents another request or state publication', async () => {
  const f = fixture(); f.start(); f.requests[0].resolve({ error: { message: 'Failed' } }); await tick();
  f.close(); f.waits.shift()(); await tick(); assert.equal(f.requests.length, 1);
});
