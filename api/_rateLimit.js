import { createClient } from '@supabase/supabase-js';

const windows = new Map();

const now = () => Date.now();

const cleanupExpiredEntries = (ts = now()) => {
  for (const [key, record] of windows.entries()) {
    if (!record || record.resetAt <= ts) {
      windows.delete(key);
    }
  }
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminSupabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

const SHARED_LIMIT_UNAVAILABLE_STATUS = 503;

const isMissingRateLimitRpcError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42883' || message.includes('check_api_rate_limit');
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

const checkRateLimitLocal = ({
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
      mode: 'local-fallback',
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
      mode: 'local-fallback',
    };
  }

  if (existing.count >= max) {
    return {
      ok: false,
      limit: max,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - ts) / 1000)),
      resetAt: existing.resetAt,
      mode: 'local-fallback',
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
    mode: 'local-fallback',
  };
};

const buildSharedRateLimitUnavailableResult = ({
  max,
  windowMs,
  reason = 'shared-unavailable',
}) => {
  const ts = now();
  return {
    ok: false,
    limit: max,
    remaining: 0,
    retryAfterSeconds: Math.max(1, Math.ceil((Number(windowMs) || 60_000) / 1000)),
    resetAt: ts + (Number(windowMs) || 60_000),
    mode: 'shared-required-unavailable',
    reason,
    status: SHARED_LIMIT_UNAVAILABLE_STATUS,
  };
};

const checkRateLimitShared = async ({
  key,
  max,
  windowMs,
}) => {
  if (!adminSupabase) {
    return {
      available: false,
      reason: 'missing-admin-client',
      result: null,
    };
  }

  const safeKey = String(key || '').trim();
  if (!safeKey || !Number.isFinite(max) || !Number.isFinite(windowMs) || max <= 0 || windowMs <= 0) {
    return {
      available: true,
      reason: '',
      result: {
        ok: true,
        limit: max,
        remaining: max,
        retryAfterSeconds: 0,
        resetAt: now(),
        mode: 'shared',
      },
    };
  }

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const { data, error } = await adminSupabase.rpc('check_api_rate_limit', {
    p_key: safeKey,
    p_max: max,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    if (!isMissingRateLimitRpcError(error)) {
      console.warn('Shared rate limit RPC failed, falling back to local limiter.', error);
    }
    return {
      available: false,
      reason: isMissingRateLimitRpcError(error) ? 'missing-shared-rpc' : 'shared-rpc-failed',
      result: null,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      available: false,
      reason: 'shared-rpc-empty',
      result: null,
    };
  }

  return {
    available: true,
    reason: '',
    result: {
      ok: Boolean(row.allowed),
      limit: Number.isFinite(Number(row.limit_count)) ? Number(row.limit_count) : max,
      remaining: Number.isFinite(Number(row.remaining)) ? Number(row.remaining) : 0,
      retryAfterSeconds: Number.isFinite(Number(row.retry_after_seconds)) ? Number(row.retry_after_seconds) : 0,
      resetAt: row.reset_at ? new Date(row.reset_at).getTime() : now(),
      mode: 'shared',
    },
  };
};

const shouldEnforceStrictSharedRateLimit = ({
  strictShared = false,
  enforceStrictShared = false,
}) => {
  if (!strictShared) return false;
  if (enforceStrictShared) return true;
  return process.env.NODE_ENV === 'production';
};

export const checkRateLimit = async ({
  key,
  max,
  windowMs,
  strictShared = false,
  enforceStrictShared = false,
}) => {
  const sharedState = await checkRateLimitShared({ key, max, windowMs });
  if (sharedState.available && sharedState.result) {
    return sharedState.result;
  }

  if (shouldEnforceStrictSharedRateLimit({ strictShared, enforceStrictShared })) {
    return buildSharedRateLimitUnavailableResult({
      max,
      windowMs,
      reason: sharedState.reason,
    });
  }

  return checkRateLimitLocal({ key, max, windowMs });
};

export const sendRateLimitResponse = (
  res,
  result,
  message = 'Too many requests. Please wait a moment and try again.',
  unavailableMessage = 'Request throttling is temporarily unavailable. Please try again shortly.'
) => {
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
  const status = Number(result?.status) || 429;
  return res.status(status).json({
    error: status === SHARED_LIMIT_UNAVAILABLE_STATUS ? unavailableMessage : message,
  });
};

export const resetRateLimitStateForTests = () => {
  windows.clear();
};
