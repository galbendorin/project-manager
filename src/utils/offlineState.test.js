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
