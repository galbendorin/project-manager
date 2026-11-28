import { metric } from '@vercel/functions';

const SENSITIVE_KEY_PATTERN = /^(auth)$|token|secret|password|passwd|authorization|auth.?key|auth.?token|cookie|api.?key|email|signature|p256dh/i;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const QUERY_STRING_PATTERN = /\?[^\s#]+/g;

export const redactText = (value = '', maxLength = 300) => {
  const cleaned = String(value ?? '')
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(QUERY_STRING_PATTERN, '?[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLength - 3))}...`;
};

export const getRequestId = (req) => String(
  req?.headers?.['x-vercel-id'] || req?.headers?.['x-request-id'] || '',
).trim();

export const sanitizeLogMeta = (value, depth = 0, maxStringLength = 300) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean' || typeof value === 'number') {
    return Number.isNaN(value) ? undefined : value;
  }
  if (typeof value === 'string') {
    return redactText(value, maxStringLength);
  }
  if (depth >= 2) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeLogMeta(item, depth + 1, maxStringLength))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entryValue] of Object.entries(value).slice(0, 25)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) continue;
      const entryMaxLength = key === 'componentStack' ? 600 : maxStringLength;
      const sanitized = sanitizeLogMeta(entryValue, depth + 1, entryMaxLength);
      if (sanitized !== undefined) {
        out[key] = sanitized;
      }
    }
    return out;
  }
  return undefined;
};

export const serializeError = (error) => {
  if (!error) return undefined;
  const serialized = {
    name: redactText(error?.name || 'Error', 80),
    message: redactText(error?.message || String(error), 300),
  };
  if (error?.code !== undefined && error?.code !== null && String(error.code).trim()) {
    serialized.code = redactText(String(error.code), 80);
  }
  const statusValue = Number(error?.statusCode ?? error?.status);
  if (Number.isFinite(statusValue) && statusValue > 0) {
    serialized.status = statusValue;
  }
  return serialized;
};

export const logServerEvent = ({
  level = 'info',
  event = 'server.event',
  route = '',
  req,
  status,
  durationMs,
  error,
  meta,
  logger = console,
} = {}) => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event: redactText(event, 100) || 'server.event',
  };

  if (route) entry.route = redactText(route, 120);
  const requestId = getRequestId(req);
  if (requestId) entry.requestId = redactText(requestId, 120);
  if (Number.isFinite(status)) entry.status = status;
  if (Number.isFinite(durationMs)) entry.durationMs = Math.max(0, Math.round(durationMs));

  const serializedError = serializeError(error);
  if (serializedError) entry.error = serializedError;

  const cleanMeta = sanitizeLogMeta(meta);
  if (cleanMeta && typeof cleanMeta === 'object' && Object.keys(cleanMeta).length > 0) {
    entry.meta = cleanMeta;
  }

  const line = JSON.stringify(entry);
  if (level === 'error') {
    logger.error(line);
  } else if (level === 'warn') {
    logger.warn(line);
  } else {
    logger.info(line);
  }
  return entry;
};

export const logServerInfo = (options) => logServerEvent({ ...options, level: 'info' });
export const logServerWarn = (options) => logServerEvent({ ...options, level: 'warn' });
export const logServerError = (options) => logServerEvent({ ...options, level: 'error' });

const sanitizeMetricAttributes = (attributes = {}) => {
  const clean = {};
  for (const [key, value] of Object.entries(attributes || {}).slice(0, 8)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      clean[key] = String(value);
    } else if (typeof value === 'string' && value.trim()) {
      clean[key] = redactText(value, 80);
    }
  }
  return clean;
};

export const recordServerMetric = (
  name,
  value = 1,
  attributes = {},
  { metricFn = metric } = {},
) => {
  const metricName = String(name || '').trim();
  const numericValue = Number(value);
  if (!metricName || !Number.isFinite(numericValue) || typeof metricFn !== 'function') {
    return false;
  }

  try {
    metricFn(metricName, numericValue, sanitizeMetricAttributes(attributes));
    return true;
  } catch {
    return false;
  }
};
