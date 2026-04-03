const PROJECT_SNAPSHOT_PREFIX = 'pmworkspace:offline:project:v1';
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
