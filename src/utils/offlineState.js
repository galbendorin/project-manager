const PROJECT_SNAPSHOT_PREFIX = 'pmworkspace:offline:project:v1';

const safeWindow = () => (typeof window !== 'undefined' ? window : null);

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
  const win = safeWindow();
  if (!win?.localStorage) return false;

  try {
    win.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const removeLocalJson = (key) => {
  const win = safeWindow();
  if (!win?.localStorage) return false;

  try {
    win.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
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
