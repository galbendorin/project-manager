import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  STORAGE_SCOPES,
  clearAiSettings,
  loadAiSettings,
  saveAiSettings,
} from './aiSettings.js';

const createStorage = () => {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
};

const withMockWindow = async (fn) => {
  const previousWindow = globalThis.window;
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  globalThis.window = { localStorage, sessionStorage };

  try {
    await fn({ localStorage, sessionStorage });
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
};

test('loadAiSettings prefers session storage over local storage', async () => {
  await withMockWindow(async ({ localStorage, sessionStorage }) => {
    localStorage.setItem('pm_os_ai_settings', JSON.stringify({
      provider: 'openai',
      apiKey: 'sk-local-123',
      model: 'gpt-4o',
    }));
    sessionStorage.setItem('pm_os_ai_settings', JSON.stringify({
      provider: 'anthropic',
      apiKey: 'sk-ant-session-123',
      model: 'claude-sonnet-4-20250514',
    }));

    const loaded = loadAiSettings();
    assert.equal(loaded.provider, 'anthropic');
    assert.equal(loaded.apiKey, 'sk-ant-session-123');
    assert.equal(loaded.storageScope, STORAGE_SCOPES.session);
  });
});

test('saveAiSettings stores session-only by default and clears persistent copy', async () => {
  await withMockWindow(async ({ localStorage, sessionStorage }) => {
    localStorage.setItem('pm_os_ai_settings', JSON.stringify({
      provider: 'openai',
      apiKey: 'sk-local-123',
      model: 'gpt-4o',
    }));

    const saved = saveAiSettings({
      provider: 'anthropic',
      apiKey: 'sk-ant-session-456',
      model: 'claude-sonnet-4-20250514',
    });

    assert.equal(saved.storageScope, STORAGE_SCOPES.session);
    assert.equal(sessionStorage.getItem('pm_os_ai_settings') !== null, true);
    assert.equal(localStorage.getItem('pm_os_ai_settings'), null);
  });
});

test('saveAiSettings can persist to local storage when explicitly requested', async () => {
  await withMockWindow(async ({ localStorage, sessionStorage }) => {
    const saved = saveAiSettings({
      provider: 'openai',
      apiKey: 'sk-local-789',
      model: 'gpt-4o-mini',
      storageScope: STORAGE_SCOPES.local,
    });

    assert.equal(saved.storageScope, STORAGE_SCOPES.local);
    assert.equal(localStorage.getItem('pm_os_ai_settings') !== null, true);
    assert.equal(sessionStorage.getItem('pm_os_ai_settings'), null);
  });
});

test('clearAiSettings removes both session and local copies', async () => {
  await withMockWindow(async ({ localStorage, sessionStorage }) => {
    localStorage.setItem('pm_os_ai_settings', JSON.stringify({
      provider: 'openai',
      apiKey: 'sk-local-123',
      model: 'gpt-4o',
    }));
    sessionStorage.setItem('pm_os_ai_settings', JSON.stringify({
      provider: 'anthropic',
      apiKey: 'sk-ant-session-123',
      model: 'claude-sonnet-4-20250514',
    }));

    const cleared = clearAiSettings();

    assert.deepEqual(cleared, DEFAULT_SETTINGS);
    assert.equal(localStorage.getItem('pm_os_ai_settings'), null);
    assert.equal(sessionStorage.getItem('pm_os_ai_settings'), null);
  });
});
