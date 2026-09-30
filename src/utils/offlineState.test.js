import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';

import {
  buildOfflineUserKey,
  buildHouseholdAccessKey,
  clearCachedOfflineUser,
  loadCachedOfflineUser,
  saveCachedOfflineUser,
  shouldClearUserOfflineKey,
} from './offlineState.js';

let storageTestId = 0;
const freshOfflineState = () => import(`./offlineState.js?storage-test=${++storageTestId}`);
const flushPromises = () => new Promise(setImmediate);

const createIndexedDb = ({ value, stallRead = false, abortRead = false } = {}) => {
  const db = {
    close: () => {},
    transaction: () => {
      const transaction = {
        objectStore: () => ({
          get: () => {
            const request = { result: value };
            if (!stallRead) {
              queueMicrotask(() => {
                if (abortRead) transaction.onabort?.();
                else transaction.oncomplete?.();
              });
            }
            return request;
          },
        }),
      };
      return transaction;
    },
  };
  return {
    db,
    open: () => {
      const request = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
};

const createStorage = () => {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
};

const withLocalStorage = async (callback) => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: createStorage() };
  try {
    await callback(globalThis.window.localStorage);
  } finally {
    if (typeof previousWindow === 'undefined') {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
};

test('buildHouseholdAccessKey scopes remembered access to one account', () => {
  assert.equal(
    buildHouseholdAccessKey('user-1'),
    'pmworkspace:household-access:v1:user-1'
  );
});

test('cached offline user remembers only the minimal verified account identity', async () => {
  await withLocalStorage(async () => {
    assert.equal(saveCachedOfflineUser({
      id: 'user-1',
      email: 'shopper@example.com',
      user_metadata: { full_name: 'Mobile Shopper', private_note: 'exclude' },
      access_token: 'exclude-token',
    }), true);

    assert.deepEqual(loadCachedOfflineUser(), {
      id: 'user-1',
      email: 'shopper@example.com',
      user_metadata: { full_name: 'Mobile Shopper' },
      isOfflineFallback: true,
    });
    assert.equal(buildOfflineUserKey('user-1'), 'pmworkspace:offline-user:v1:user-1');

    clearCachedOfflineUser('user-1');
    assert.equal(loadCachedOfflineUser(), null);
  });
});

test('shouldClearUserOfflineKey removes signed-out user data and navigation state', () => {
  assert.equal(shouldClearUserOfflineKey('pmworkspace:shopping-offline:v1:user-1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:timesheet-offline:v1:user-1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:offline:project:v1:user-1:project-1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:itil-foundation-quiz:user-1:v1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:household-access:v1:user-1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:offline-user:v1:user-1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:offline-user-active:v1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:last-project:v1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:last-path:v1', 'user-1'), true);
});

test('shouldClearUserOfflineKey never removes another account cache or harmless preferences', () => {
  assert.equal(shouldClearUserOfflineKey('pmworkspace:shopping-offline:v1:user-2', 'user-1'), false);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:shopping-ui:v1', 'user-1'), false);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:shopping-offline:v1:user-1', ''), false);
});

test('a stalled IndexedDB open returns the existing local queue within the startup deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withLocalStorage(async (storage) => {
    const snapshot = { tasks: [{ id: 'local-task' }], projectSyncQueue: [{ id: 'unsynced-edit' }] };
    storage.setItem('project', JSON.stringify(snapshot));
    globalThis.window.indexedDB = { open: () => ({}) };
    const { readOfflineJson } = await freshOfflineState();
    const pending = readOfflineJson('project', null);
    t.mock.timers.tick(1500);
    assert.deepEqual(await pending, snapshot);
    assert.deepEqual(JSON.parse(storage.getItem('project')), snapshot);
  });
});

test('a stalled IndexedDB transaction falls back to local data without clearing queued changes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withLocalStorage(async (storage) => {
    const snapshot = { queue: [{ id: 'offline-shopping-edit' }] };
    storage.setItem('shopping', JSON.stringify(snapshot));
    globalThis.window.indexedDB = createIndexedDb({ stallRead: true });
    const { readOfflineJson } = await freshOfflineState();
    const pending = readOfflineJson('shopping', null);
    await flushPromises();
    t.mock.timers.tick(1500);
    assert.deepEqual(await pending, snapshot);
    assert.deepEqual(JSON.parse(storage.getItem('shopping')), snapshot);
  });
});

test('an aborted IndexedDB transaction resolves to the local snapshot', async () => {
  await withLocalStorage(async (storage) => {
    storage.setItem('project', JSON.stringify({ tasks: ['local-task'] }));
    globalThis.window.indexedDB = createIndexedDb({ abortRead: true });
    const { readOfflineJson } = await freshOfflineState();
    assert.deepEqual(await readOfflineJson('project', null), { tasks: ['local-task'] });
  });
});

test('healthy IndexedDB still supplies newer pending edits when localStorage has older data', async () => {
  await withLocalStorage(async (storage) => {
    const latest = { queue: [{ id: 'new-edit' }] };
    storage.setItem('shopping', JSON.stringify({ queue: [] }));
    globalThis.window.indexedDB = createIndexedDb({ value: latest });
    const { readOfflineJson } = await freshOfflineState();
    assert.deepEqual(await readOfflineJson('shopping', null), latest);
  });
});

test('read-only durable lookup does not promote into local storage', async () => {
  await withLocalStorage(async storage => {
    globalThis.window.indexedDB = createIndexedDb({ value: { queue: ['durable'] } });
    const { readOfflineJson } = await freshOfflineState();
    assert.deepEqual(await readOfflineJson('shopping', null, { hydrateLocal: false }), { queue: ['durable'] });
    assert.equal(storage.getItem('shopping'), null);
  });
});

test('implicit durable hydration preserves a local write made while the read was pending', async () => {
  await withLocalStorage(async storage => {
    globalThis.window.indexedDB = createIndexedDb({ value: { queue: ['old'] } });
    const { readOfflineJson } = await freshOfflineState();
    const reading = readOfflineJson('shopping', null);
    storage.setItem('shopping', JSON.stringify({ queue: ['new'] }));
    await reading;
    assert.deepEqual(JSON.parse(storage.getItem('shopping')), { queue: ['new'] });
  });
});

test('a timed-out database can reopen and a late unused connection is closed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withLocalStorage(async () => {
    let closed = false;
    const request = { result: { close: () => { closed = true; } } };
    globalThis.window.indexedDB = { open: () => request };
    const { readOfflineJson } = await freshOfflineState();
    const pending = readOfflineJson('project', null);
    t.mock.timers.tick(1500);
    assert.equal(await pending, null);
    request.onsuccess();
    assert.equal(closed, true);

    globalThis.window.indexedDB = createIndexedDb({ value: { tasks: ['recovered-task'] } });
    assert.deepEqual(await readOfflineJson('project', null), { tasks: ['recovered-task'] });
  });
});

test('denied browser storage getters do not crash auth or offline startup', async () => {
  await withLocalStorage(async () => {
    for (const name of ['localStorage', 'indexedDB']) {
      Object.defineProperty(globalThis.window, name, {
        get: () => { throw new Error('Storage denied'); },
        configurable: true,
      });
    }
    const { loadCachedOfflineUser, readOfflineJson, writeLocalJson } = await freshOfflineState();
    assert.equal(loadCachedOfflineUser(), null);
    assert.equal(await readOfflineJson('project', null), null);
    assert.equal(writeLocalJson('project', { tasks: [] }), false);
  });
});

test('sign-out cleanup cannot erase a replacement account identity or navigation during database startup', async () => {
  await withLocalStorage(async storage => {
    const indexedDB = new IDBFactory();
    let openRequest;
    globalThis.window.indexedDB = { open: (...args) => { openRequest = indexedDB.open(...args); return openRequest; } };
    const state = await freshOfflineState();
    const oldKey = 'pmworkspace:shopping-offline:v1:old';
    const newKey = 'pmworkspace:shopping-offline:v1:new';
    storage.setItem(oldKey, JSON.stringify({ queue: ['old-intent'] }));
    storage.setItem('pmworkspace:offline-user-active:v1', JSON.stringify('old'));
    storage.setItem('pmworkspace:last-path:v1', JSON.stringify('/shopping'));
    const cleaning = state.clearOfflineDataForUser('old');
    state.saveCachedOfflineUser({ id: 'new', email: 'new@example.test' });
    state.writeLocalJson(newKey, { queue: ['new-intent'] });
    state.writeLocalJson('pmworkspace:last-path:v1', '/timesheet');
    await cleaning;
    assert.equal(state.loadCachedOfflineUser()?.id, 'new');
    assert.equal(state.readLocalJson('pmworkspace:last-path:v1'), '/timesheet');
    assert.equal(storage.getItem(oldKey), null);
    assert.deepEqual(await state.readOfflineJson(newKey, null), { queue: ['new-intent'] });
    assert.equal(await state.readOfflineJson('pmworkspace:offline-user-active:v1', null), 'new');
    openRequest.result.close();
  });
});

test('sign-out cleanup leaves newly written same-account intent intact after database startup', async () => {
  await withLocalStorage(async storage => {
    const indexedDB = new IDBFactory(); let openRequest;
    globalThis.window.indexedDB = { open: (...args) => { openRequest = indexedDB.open(...args); return openRequest; } };
    const state = await freshOfflineState();
    const key = 'pmworkspace:shopping-offline:v1:owner';
    storage.setItem(key, JSON.stringify({ queue: ['old-intent'] }));
    const cleaning = state.clearOfflineDataForUser('owner');
    state.saveCachedOfflineUser({ id: 'owner' });
    state.writeLocalJson(key, { queue: ['new-intent'] });
    await cleaning;
    assert.equal(state.loadCachedOfflineUser()?.id, 'owner');
    assert.deepEqual(state.readLocalJson(key), { queue: ['new-intent'] });
    assert.deepEqual(await state.readOfflineJson(key, null), { queue: ['new-intent'] });
    openRequest.result.close();
  });
});

test('a durable-only read begun before sign-out cannot revive the cleared cache', async () => {
  await withLocalStorage(async storage => {
    const indexedDB = new IDBFactory(); let openRequest;
    globalThis.window.indexedDB = { open: (...args) => { openRequest = indexedDB.open(...args); return openRequest; } };
    const state = await freshOfflineState();
    const key = 'pmworkspace:timesheet-offline:v1:owner';
    state.writeLocalJson(key, { queue: ['old-intent'] });
    await state.readOfflineJson(key, null);
    storage.removeItem(key);
    const reading = state.readOfflineJson(key, null);
    const cleaning = state.clearOfflineDataForUser('owner');
    assert.equal(await reading, null);
    await cleaning;
    assert.equal(storage.getItem(key), null);
    assert.equal(await state.readOfflineJson(key, null), null);
    openRequest.result.close();
  });
});

test('cleanup clears both stores for the leaving account and preserves other accounts and preferences', async () => {
  await withLocalStorage(async storage => {
    const indexedDB = new IDBFactory(); let openRequest;
    globalThis.window.indexedDB = { open: (...args) => { openRequest = indexedDB.open(...args); return openRequest; } };
    const state = await freshOfflineState();
    const keys = ['pmworkspace:shopping-offline:v1:old', 'pmworkspace:timesheet-offline:v1:old',
      'pmworkspace:offline:project:v1:old:project', 'pmworkspace:household-access:v1:old'];
    keys.forEach(key => state.writeLocalJson(key, { private: 'old' }));
    state.writeLocalJson('pmworkspace:shopping-offline:v1:new', { queue: ['new-intent'] });
    state.writeLocalJson('pmworkspace:shopping-ui:v1', { compact: true });
    state.saveCachedOfflineUser({ id: 'new' });
    state.writeLocalJson('pmworkspace:last-path:v1', '/shopping');
    await state.readOfflineJson(keys[0], null);
    const newReading = state.readOfflineJson('pmworkspace:shopping-offline:v1:new', null);
    await state.clearOfflineDataForUser('old');
    for (const key of keys) {
      assert.equal(storage.getItem(key), null);
      assert.equal(await state.readOfflineJson(key, null), null);
    }
    assert.deepEqual(await newReading, { queue: ['new-intent'] });
    assert.equal(state.loadCachedOfflineUser()?.id, 'new');
    assert.equal(await state.readOfflineJson('pmworkspace:offline-user-active:v1', null), 'new');
    assert.equal(await state.readOfflineJson('pmworkspace:last-path:v1', null), '/shopping');
    assert.deepEqual(await state.readOfflineJson('pmworkspace:shopping-ui:v1', null), { compact: true });
    openRequest.result.close();
  });
});

test('clearing an old cached identity preserves the active replacement identity', async () => {
  await withLocalStorage(async () => {
    saveCachedOfflineUser({ id: 'old' });
    saveCachedOfflineUser({ id: 'new' });
    clearCachedOfflineUser('old');
    assert.equal(loadCachedOfflineUser()?.id, 'new');
  });
});

test('sign-out clears local data immediately even when IndexedDB cannot open', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await withLocalStorage(async storage => {
    globalThis.window.indexedDB = { open: () => ({}) };
    const state = await freshOfflineState();
    const key = 'pmworkspace:shopping-offline:v1:owner';
    storage.setItem(key, JSON.stringify({ queue: ['old-intent'] }));
    const cleaning = state.clearOfflineDataForUser('owner');
    assert.equal(storage.getItem(key), null);
    t.mock.timers.tick(1500);
    await cleaning;
  });
});
