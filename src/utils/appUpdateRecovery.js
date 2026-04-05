export const CHUNK_LOAD_GUARD_KEY = 'pmworkspace:chunk-reload-guard:v1';

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
