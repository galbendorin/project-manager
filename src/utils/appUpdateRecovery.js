export const CHUNK_LOAD_GUARD_KEY = 'pmworkspace:chunk-reload-guard:v1';
export const CHUNK_RECOVERY_QUERY_PARAM = 'pmw-recover';

const CHUNK_LOAD_PATTERNS = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'chunkloaderror',
  'error loading dynamically imported module',
  'failed to load module script',
];

export const isLikelyChunkLoadFailure = (input) => {
  const message = typeof input === 'string'
    ? input
    : input?.message || input?.reason?.message || input?.reason || '';

  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return false;

  return CHUNK_LOAD_PATTERNS.some((pattern) => normalized.includes(pattern));
};

export const getSafeSessionStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

export const consumeChunkReloadGuard = (storage) => {
  try {
    return storage?.getItem(CHUNK_LOAD_GUARD_KEY) === '1';
  } catch {
    return false;
  }
};

export const markChunkReloadGuard = (storage) => {
  try {
    storage?.setItem(CHUNK_LOAD_GUARD_KEY, '1');
  } catch {
    // Ignore storage failures and still allow a best-effort reload.
  }
};

export const clearChunkReloadGuard = (storage) => {
  try {
    storage?.removeItem(CHUNK_LOAD_GUARD_KEY);
  } catch {
    // Ignore storage failures.
  }
};

export const shouldAttemptChunkRecoveryReload = (errorLike, storage, isOnline = true) => {
  if (!isOnline) return false;
  if (!isLikelyChunkLoadFailure(errorLike)) return false;
  if (consumeChunkReloadGuard(storage)) return false;
  return true;
};

export const buildChunkRecoveryUrl = (locationLike, stamp = Date.now()) => {
  if (!locationLike) return '';

  const base = locationLike.origin || 'https://pmworkspace.local';
  const url = new URL(
    `${locationLike.pathname || '/'}${locationLike.search || ''}${locationLike.hash || ''}`,
    base
  );
  url.searchParams.set(CHUNK_RECOVERY_QUERY_PARAM, String(stamp));
  return url.toString();
};

export const stripChunkRecoveryParam = (locationLike) => {
  if (!locationLike) return '';

  const base = locationLike.origin || 'https://pmworkspace.local';
  const url = new URL(
    `${locationLike.pathname || '/'}${locationLike.search || ''}${locationLike.hash || ''}`,
    base
  );
  url.searchParams.delete(CHUNK_RECOVERY_QUERY_PARAM);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash || ''}`;
};
