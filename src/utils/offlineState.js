const PROJECT_SNAPSHOT_PREFIX = 'pmworkspace:offline:project:v1';
const SHOPPING_OFFLINE_PREFIX = 'pmworkspace:shopping-offline:v1';
const TIMESHEET_OFFLINE_PREFIX = 'pmworkspace:timesheet-offline:v1';
const ITIL_QUIZ_PREFIX = 'pmworkspace:itil-foundation-quiz';
const HOUSEHOLD_ACCESS_PREFIX = 'pmworkspace:household-access:v1';
const NAVIGATION_CACHE_KEYS = new Set([
  'pmworkspace:last-path:v1',
  'pmworkspace:last-project:v1',
]);
const OFFLINE_DB_NAME = 'pmworkspace-offline';
const OFFLINE_STORE_NAME = 'keyval';

const safeWindow = () => (typeof window !== 'undefined' ? window : null);
let openDbPromise = null;

const canUseIndexedDb = () => {
  const win = safeWindow();
  return Boolean(win?.indexedDB);
};

const writeLocalStorageOnly = (key, value) => {
  const win = safeWindow();
  if (!win?.localStorage) return false;

  try {
    win.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const removeLocalStorageOnly = (key) => {
  const win = safeWindow();
  if (!win?.localStorage) return false;

  try {
    win.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const openOfflineDb = async () => {
  if (!canUseIndexedDb()) return null;
  if (openDbPromise) return openDbPromise;

  openDbPromise = new Promise((resolve, reject) => {
    const request = safeWindow().indexedDB.open(OFFLINE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
        db.createObjectStore(OFFLINE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open offline database.'));
    request.onblocked = () => reject(new Error('Offline database is blocked.'));
  }).catch((error) => {
    openDbPromise = null;
    console.warn('IndexedDB unavailable, falling back to localStorage only.', error);
    return null;
  });

  return openDbPromise;
};

const readIndexedDbJson = async (key) => {
  const db = await openOfflineDb();
  if (!db) return undefined;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OFFLINE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(OFFLINE_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to read offline cache.'));
  }).catch(() => undefined);
};

const writeIndexedDbJson = async (key, value) => {
  const db = await openOfflineDb();
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(OFFLINE_STORE_NAME);
    const request = store.put(value, key);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error('Unable to write offline cache.'));
  }).catch(() => false);
};

const removeIndexedDbJson = async (key) => {
  const db = await openOfflineDb();
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(OFFLINE_STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error('Unable to remove offline cache.'));
  }).catch(() => false);
};

export const readLocalJson = (key, fallback) => {
  const win = safeWindow();
  if (!win?.localStorage) return fallback;

  try {
    const raw = win.localStorage.getItem(key);
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
    || normalizedKey === buildHouseholdAccessKey(normalizedUserId);
};

const listLocalStorageKeys = () => {
  const storage = safeWindow()?.localStorage;
  if (!storage) return [];

  try {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean);
  } catch {
    return [];
  }
};

const listIndexedDbKeys = async () => {
  const db = await openOfflineDb();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OFFLINE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(OFFLINE_STORE_NAME).getAllKeys();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Unable to inspect offline cache.'));
  }).catch(() => []);
};

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
