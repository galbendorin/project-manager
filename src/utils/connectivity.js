const NETWORK_ERROR_CODES = new Set([
  'network_error',
  'fetch_error',
  'econnaborted',
  'econnrefused',
  'enetwork',
]);

const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'fetch failed',
  'load failed',
  'networkerror',
  'network error',
  'network request failed',
  'connection was lost',
  'internet connection appears to be offline',
  'the network connection was lost',
];

export const isLikelyNetworkError = (error, { online } = {}) => {
  if (online === false) return true;
  if (!error) return false;

  const code = String(error?.code || error?.name || '').trim().toLowerCase();
  if (NETWORK_ERROR_CODES.has(code)) return true;

  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 0 && (error instanceof TypeError || code === 'typeerror')) return true;

  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};
