import test from 'node:test';
import assert from 'node:assert/strict';
import { startAuthBootstrap } from './authBootstrap.js';

const createAuthHarness = () => {
  const initialSession = Promise.withResolvers();
  let listener;
  let unsubscribed = false;
  const calls = [];
  const stop = startAuthBootstrap({
    auth: {
      getSession: () => initialSession.promise,
      onAuthStateChange: (callback) => {
        listener = callback;
        return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
      },
    },
    onSession: (session) => calls.push(['session', session]),
    onAuthStateChange: (event, session) => calls.push([event, session]),
    onError: (error) => calls.push(['error', error.message]),
    onTimeout: () => calls.push(['offline-fallback']),
  });
  return { calls, initialSession, emit: (...args) => listener(...args), stop, isUnsubscribed: () => unsubscribed };
};

test('a resolved signed-out session never restores a stale cached user four seconds later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const harness = createAuthHarness();
  harness.initialSession.resolve({ data: { session: null } });
  await Promise.resolve();
  t.mock.timers.tick(5000);
  assert.deepEqual(harness.calls, [['session', null]]);
  harness.stop();
});

test('a sign-out event wins over a late initial session and disables the offline fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const harness = createAuthHarness();
  harness.emit('SIGNED_OUT', null);
  harness.initialSession.resolve({ data: { session: { user: { id: 'old-user' } } } });
  await Promise.resolve();
  t.mock.timers.tick(5000);
  assert.deepEqual(harness.calls, [['SIGNED_OUT', null]]);
  harness.stop();
});

test('a stalled session can use offline access and then recover when auth finishes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const harness = createAuthHarness();
  t.mock.timers.tick(4000);
  const session = { user: { id: 'verified-user' } };
  harness.initialSession.resolve({ data: { session } });
  await Promise.resolve();
  assert.deepEqual(harness.calls, [['offline-fallback'], ['session', session]]);
  harness.stop();
});

test('a returned session error is handled once without a second fallback timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const harness = createAuthHarness();
  harness.initialSession.resolve({ data: { session: null }, error: new Error('Network unavailable') });
  await Promise.resolve();
  t.mock.timers.tick(5000);
  assert.deepEqual(harness.calls, [['error', 'Network unavailable']]);
  harness.stop();
});

test('unmount cancels pending startup work and unsubscribes from auth', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const harness = createAuthHarness();
  harness.stop();
  harness.emit('SIGNED_IN', { user: { id: 'late-user' } });
  harness.initialSession.resolve({ data: { session: null } });
  await Promise.resolve();
  t.mock.timers.tick(5000);
  assert.deepEqual(harness.calls, []);
  assert.equal(harness.isUnsubscribed(), true);
});
