const windows = new Map();

const now = () => Date.now();

const cleanupExpiredEntries = (ts = now()) => {
  for (const [key, record] of windows.entries()) {
    if (!record || record.resetAt <= ts) {
      windows.delete(key);
    }
  }
};

export const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return 'unknown';
};

export const checkRateLimit = ({
  key,
  max,
  windowMs,
}) => {
  const ts = now();
  cleanupExpiredEntries(ts);

  const safeKey = String(key || '').trim();
  if (!safeKey || !Number.isFinite(max) || !Number.isFinite(windowMs) || max <= 0 || windowMs <= 0) {
    return {
      ok: true,
      limit: max,
      remaining: max,
      retryAfterSeconds: 0,
      resetAt: ts,
    };
  }

  const existing = windows.get(safeKey);
  if (!existing || existing.resetAt <= ts) {
    const record = {
      count: 1,
      resetAt: ts + windowMs,
    };
    windows.set(safeKey, record);
    return {
      ok: true,
      limit: max,
      remaining: Math.max(0, max - record.count),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      resetAt: record.resetAt,
    };
  }

  if (existing.count >= max) {
    return {
      ok: false,
      limit: max,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - ts) / 1000)),
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  windows.set(safeKey, existing);
  return {
    ok: true,
    limit: max,
    remaining: Math.max(0, max - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - ts) / 1000)),
    resetAt: existing.resetAt,
  };
};

export const sendRateLimitResponse = (res, result, message = 'Too many requests. Please wait a moment and try again.') => {
  if (result?.limit) {
    res.setHeader('X-RateLimit-Limit', String(result.limit));
  }
  if (typeof result?.remaining === 'number') {
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  }
  if (result?.resetAt) {
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  }
  if (result?.retryAfterSeconds) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
  }
  return res.status(429).json({ error: message });
};
