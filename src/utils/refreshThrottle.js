export const DEFAULT_REFRESH_FRESHNESS_MS = 30_000;

const toTimestamp = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.trim()) return Date.parse(value);
  return NaN;
};

export const isFreshTimestamp = (
  timestamp,
  now = Date.now(),
  freshnessMs = DEFAULT_REFRESH_FRESHNESS_MS,
) => {
  const previous = toTimestamp(timestamp);
  const current = toTimestamp(now);
  const windowMs = Number(freshnessMs);

  if (!Number.isFinite(previous) || !Number.isFinite(current) || !Number.isFinite(windowMs) || windowMs <= 0) {
    return false;
  }

  return current - previous < windowMs;
};

export const shouldRefreshAfterFocus = (
  lastRefreshAt,
  now = Date.now(),
  freshnessMs = DEFAULT_REFRESH_FRESHNESS_MS,
) => !isFreshTimestamp(lastRefreshAt, now, freshnessMs);
