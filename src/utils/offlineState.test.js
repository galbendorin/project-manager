import test from 'node:test';
import assert from 'node:assert/strict';

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
