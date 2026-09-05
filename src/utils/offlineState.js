const PROJECT_SNAPSHOT_PREFIX = 'pmworkspace:offline:project:v1';
const SHOPPING_OFFLINE_PREFIX = 'pmworkspace:shopping-offline:v1';
const TIMESHEET_OFFLINE_PREFIX = 'pmworkspace:timesheet-offline:v1';
const ITIL_QUIZ_PREFIX = 'pmworkspace:itil-foundation-quiz';
const HOUSEHOLD_ACCESS_PREFIX = 'pmworkspace:household-access:v1';
const OFFLINE_USER_PREFIX = 'pmworkspace:offline-user:v1';
const ACTIVE_OFFLINE_USER_KEY = 'pmworkspace:offline-user-active:v1';
const NAVIGATION_CACHE_KEYS = new Set([
  'pmworkspace:last-path:v1',
  'pmworkspace:last-project:v1',
  ACTIVE_OFFLINE_USER_KEY,
]);
const OFFLINE_DB_NAME = 'pmworkspace-offline';
const OFFLINE_STORE_NAME = 'keyval';
const OFFLINE_STORAGE_TIMEOUT_MS = 1500;

const safeWindow = () => (typeof window !== 'undefined' ? window : null);
let openDbPromise = null;

const getBrowserStorage = (name) => {
  try {
    return safeWindow()?.[name] || null;
  } catch {
    return null;
  }
};

const writeLocalStorageOnly = (key, value) => {
  const storage = getBrowserStorage('localStorage');
  if (!storage) return false;

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const removeLocalStorageOnly = (key) => {
  const storage = getBrowserStorage('localStorage');
  if (!storage) return false;

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const openOfflineDb = async () => {
  const indexedDb = getBrowserStorage('indexedDB');
  if (!indexedDb) return null;
  if (openDbPromise) return openDbPromise;

  const pendingOpen = new Promise((resolve) => {
    let settled = false;
    const finish = (db) => {
      if (settled) {
        // A timed-out open can still succeed later. Do not leak its connection.
        db?.close();
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      resolve(db);
    };
    const timeoutId = setTimeout(() => finish(null), OFFLINE_STORAGE_TIMEOUT_MS);

    try {
      const request = indexedDb.open(OFFLINE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
          db.createObjectStore(OFFLINE_STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const forgetConnection = () => {
          if (openDbPromise === pendingOpen) openDbPromise = null;
        };
        db.onversionchange = () => {
          forgetConnection();
          db.close();
        };
        db.onclose = forgetConnection;
        finish(db);
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
  openDbPromise = pendingOpen;
  const db = await pendingOpen;
  if (!db && openDbPromise === pendingOpen) openDbPromise = null;
  return db;
};

const runOfflineTransaction = async (mode, operation, fallback, getResult = (request) => request.result) => {
  const db = await openOfflineDb();
  if (!db) return fallback;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
    };
    const timeoutId = setTimeout(() => finish(fallback), OFFLINE_STORAGE_TIMEOUT_MS);
    try {
      const transaction = db.transaction(OFFLINE_STORE_NAME, mode);
      const request = operation(transaction.objectStore(OFFLINE_STORE_NAME));
      transaction.oncomplete = () => finish(getResult(request));
      transaction.onabort = () => finish(fallback);
      transaction.onerror = () => finish(fallback);
      request.onerror = () => finish(fallback);
    } catch {
      // Safari can close an idle database while the app is suspended. Reopen it
      // on the next attempt instead of retaining a permanently unusable handle.
      openDbPromise = null;
      finish(fallback);
    }
    // A slow write may still commit after the deadline. Leave it intact: queued
    // offline changes must not be discarded to unblock startup or sign-out.
  });
};

const readIndexedDbJson = (key) => (
  runOfflineTransaction('readonly', (store) => store.get(key), undefined)
);

const writeIndexedDbJson = (key, value) => (
  runOfflineTransaction('readwrite', (store) => store.put(value, key), false, () => true)
);

const removeIndexedDbJson = (key) => (
  runOfflineTransaction('readwrite', (store) => store.delete(key), false, () => true)
);

export const readLocalJson = (key, fallback) => {
  const storage = getBrowserStorage('localStorage');
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const writeLocalJson = (key, value) => {
  const didWriteLocal = writeLocalStorageOnly(key, value);
  void writeIndexedDbJson(key, value);
  return didWriteLocal;
};

export const removeLocalJson = (key) => {
  const didRemoveLocal = removeLocalStorageOnly(key);
  void removeIndexedDbJson(key);
  return didRemoveLocal;
};

export const readOfflineJson = async (key, fallback) => {
  const localValue = readLocalJson(key, undefined);
  const indexedValue = await readIndexedDbJson(key);

  if (typeof indexedValue !== 'undefined') {
    if (typeof localValue === 'undefined') {
      writeLocalStorageOnly(key, indexedValue);
    }
    return indexedValue;
  }

  return typeof localValue === 'undefined' ? fallback : localValue;
};

export const createOfflineTempId = (prefix = 'offline') => {
  const randomPart = (
    typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  return `${prefix}-${randomPart}`;
};

export const isOfflineTempId = (value = '') => String(value || '').startsWith('offline-');

export const buildProjectSnapshotKey = (projectId, userId = 'anon') => (
  `${PROJECT_SNAPSHOT_PREFIX}:${userId}:${projectId}`
);

export const buildHouseholdAccessKey = (userId = 'anon') => (
  `${HOUSEHOLD_ACCESS_PREFIX}:${userId}`
);

export const buildOfflineUserKey = (userId = 'anon') => (
  `${OFFLINE_USER_PREFIX}:${userId}`
);

const normalizeOfflineUser = (user) => {
  const id = String(user?.id || '').trim();
  if (!id) return null;

  const fullName = String(user?.user_metadata?.full_name || '').trim();
  return {
    id,
    email: String(user?.email || '').trim(),
    user_metadata: fullName ? { full_name: fullName } : {},
    isOfflineFallback: true,
  };
};

export const loadCachedOfflineUser = () => {
  const activeUserId = String(readLocalJson(ACTIVE_OFFLINE_USER_KEY, '') || '').trim();
  if (!activeUserId) return null;

  return normalizeOfflineUser(readLocalJson(buildOfflineUserKey(activeUserId), null));
};

export const saveCachedOfflineUser = (user) => {
  const normalizedUser = normalizeOfflineUser(user);
  if (!normalizedUser) return false;

  const savedUser = writeLocalJson(buildOfflineUserKey(normalizedUser.id), normalizedUser);
  const savedPointer = writeLocalJson(ACTIVE_OFFLINE_USER_KEY, normalizedUser.id);
  return savedUser && savedPointer;
};

export const clearCachedOfflineUser = (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (normalizedUserId) {
    removeLocalJson(buildOfflineUserKey(normalizedUserId));
  }
  removeLocalJson(ACTIVE_OFFLINE_USER_KEY);
};

export const loadCachedHouseholdAccess = (userId) => (
  readLocalJson(buildHouseholdAccessKey(userId), false) === true
);

export const saveCachedHouseholdAccess = (userId, enabled = true) => (
  writeLocalJson(buildHouseholdAccessKey(userId), enabled === true)
);

export const shouldClearUserOfflineKey = (key, userId) => {
  const normalizedKey = String(key || '');
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return false;
  if (NAVIGATION_CACHE_KEYS.has(normalizedKey)) return true;

  return normalizedKey.startsWith(`${PROJECT_SNAPSHOT_PREFIX}:${normalizedUserId}:`)
    || normalizedKey === `${SHOPPING_OFFLINE_PREFIX}:${normalizedUserId}`
    || normalizedKey === `${TIMESHEET_OFFLINE_PREFIX}:${normalizedUserId}`
    || normalizedKey.startsWith(`${ITIL_QUIZ_PREFIX}:${normalizedUserId}:`)
    || normalizedKey === buildOfflineUserKey(normalizedUserId)
    || normalizedKey === buildHouseholdAccessKey(normalizedUserId);
};

const listLocalStorageKeys = () => {
  const storage = getBrowserStorage('localStorage');
  if (!storage) return [];

  try {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
  } catch {
    return [];
  }
};

const listIndexedDbKeys = () => (
  runOfflineTransaction('readonly', (store) => store.getAllKeys(), [], (request) => request.result || [])
);

export const clearOfflineDataForUser = async (userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [];

  const indexedDbKeys = await listIndexedDbKeys();
  const keysToRemove = [...new Set([
    ...listLocalStorageKeys(),
    ...indexedDbKeys.map(String),
  ].filter((key) => shouldClearUserOfflineKey(key, normalizedUserId)))];

  keysToRemove.forEach(removeLocalStorageOnly);
  await Promise.all(keysToRemove.map(removeIndexedDbJson));
  return keysToRemove;
};
