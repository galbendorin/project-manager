import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('./registerServiceWorker.js', import.meta.url), 'utf8'))
  .replaceAll('export const ', 'const ')
  .replace('import.meta.env.PROD', 'true');

const setup = async ({ readyState = 'complete', activate = true, waiting = true } = {}) => {
  const events = new EventTarget();
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { readyState });
  const timers = new Map();
  let timerId = 0;
  let registered = 0;
  const worker = Object.assign(events, { controller: { version: 'old' } });
  const registration = Object.assign(new EventTarget(), {
    waiting: waiting ? {
      postMessage(message) {
        assert.equal(message.type, 'SKIP_WAITING');
        if (activate) {
          worker.controller = { version: 'new' };
          worker.dispatchEvent(new Event('controllerchange'));
        }
      },
    } : null,
    update: async () => {},
  });
  worker.register = async () => { registered += 1; return registration; };
  const context = vm.createContext({
    window, document, navigator: { serviceWorker: worker }, CustomEvent, console,
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(`${source}\nthis.api = { registerServiceWorker, activatePendingServiceWorker, hasPendingServiceWorker };`, context);
  context.api.registerServiceWorker();
  await Promise.resolve();
  return { api: context.api, window, timers, getRegistered: () => registered };
};

test('registers even when entry code executes after the load event', async () => {
  const runtime = await setup();
  assert.equal(runtime.getRegistered(), 1);
  assert.equal(runtime.api.hasPendingServiceWorker(), true);
});

test('registers once after load if the document is still loading', async () => {
  const runtime = await setup({ readyState: 'loading' });
  assert.equal(runtime.getRegistered(), 0);
  runtime.window.dispatchEvent(new Event('load'));
  runtime.window.dispatchEvent(new Event('load'));
  await Promise.resolve();
  assert.equal(runtime.getRegistered(), 1);
});

test('captures immediate controller change before returning from activation message', async () => {
  const { api, timers } = await setup();
  assert.equal(await api.activatePendingServiceWorker(), true);
  assert.equal(timers.size, 0);
});

test('a slow worker does not trigger a premature reload after a fixed delay', async () => {
  const { api, timers } = await setup({ activate: false });
  let result = 'pending';
  const activation = api.activatePendingServiceWorker().then((value) => { result = value; });
  await Promise.resolve();
  assert.equal(result, 'pending');
  for (const callback of timers.values()) callback();
  await activation;
  assert.equal(result, false);
  assert.equal(timers.size, 0);
});

test('a worker already activated by another window permits a fresh reload', async () => {
  const { api } = await setup({ waiting: false });
  assert.equal(await api.activatePendingServiceWorker(), true);
});
