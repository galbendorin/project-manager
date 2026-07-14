const VERSION_TOKEN = "'__PM_CACHE_VERSION__'";
const MANIFEST_TOKEN = '/* __PM_PRECACHE_MANIFEST__ */ []';

const normalizeOutputPath = (value = '') => {
  const normalized = String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');

  return normalized ? `/${normalized}` : '';
};

export const buildPrecacheUrls = (outputPaths = []) => (
  [...new Set(
    (Array.isArray(outputPaths) ? outputPaths : [])
      .map(normalizeOutputPath)
      .filter((url) => url && url !== '/sw.js' && !url.endsWith('.map'))
  )].sort()
);

export const injectServiceWorkerManifest = (source, {
  version,
  urls,
} = {}) => {
  const normalizedSource = String(source || '');
  const normalizedVersion = String(version || '').trim();
  const normalizedUrls = buildPrecacheUrls(urls);

  if (!normalizedVersion) {
    throw new Error('A service worker cache version is required.');
  }
  if (!normalizedSource.includes(VERSION_TOKEN) || !normalizedSource.includes(MANIFEST_TOKEN)) {
    throw new Error('Service worker manifest placeholders are missing.');
  }

  return normalizedSource
    .replace(VERSION_TOKEN, JSON.stringify(normalizedVersion))
    .replace(MANIFEST_TOKEN, JSON.stringify(normalizedUrls));
};
