const CLIENT_ERROR_ENDPOINT = '/api/client-error';
const MAX_SESSION_REPORTS = 5;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const QUERY_STRING_PATTERN = /\?[^\s#]+/g;
const IGNORED_ERROR_MESSAGES = [
  'resizeobserver loop limit exceeded',
  'resizeobserver loop completed with undelivered notifications',
];

const reportedKeys = new Set();
let sessionReportCount = 0;
let listenersInstalled = false;

const cleanClientText = (value = '', maxLength = 300) => {
  const cleaned = String(value ?? '')
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(QUERY_STRING_PATTERN, '?[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3))}...`;
};

const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true,
  );
};

export const sanitizeClientErrorPayload = ({
  error,
  info,
  kind = 'react-error-boundary',
  locationLike,
  isStandalone = isStandaloneMode(),
} = {}) => {
  const loc = locationLike || (typeof window !== 'undefined' ? window.location : null);
  const rawMessage = typeof error === 'string'
    ? error
    : error?.message || error?.reason?.message || error?.reason || '';
  const message = cleanClientText(rawMessage, 300);
  if (!message) return null;

  const normalizedLower = message.toLowerCase();
  if (IGNORED_ERROR_MESSAGES.some((pattern) => normalizedLower.includes(pattern))) {
    return null;
  }

  const name = cleanClientText(
    typeof error === 'object' && error !== null ? (error.name || error?.reason?.name || 'Error') : 'Error',
    80,
  ) || 'Error';

  let route = '/';
  if (loc?.pathname) {
    route = String(loc.pathname).slice(0, 120);
  } else if (loc?.href) {
    try {
      route = new URL(loc.href, 'https://pmworkspace.local').pathname.slice(0, 120);
    } catch {
      route = '/';
    }
  }

  const componentStack = info?.componentStack
    ? cleanClientText(info.componentStack, 600)
    : undefined;

  return {
    kind,
    name,
    message,
    route,
    isStandalone: Boolean(isStandalone),
    ...(componentStack ? { componentStack } : {}),
  };
};

const defaultSendTelemetry = (jsonBody) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && typeof Blob !== 'undefined') {
      const queued = navigator.sendBeacon(
        CLIENT_ERROR_ENDPOINT,
        new Blob([jsonBody], { type: 'application/json' }),
      );
      if (queued) return;
    }

    if (typeof fetch === 'function') {
      void fetch(CLIENT_ERROR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonBody,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Telemetry is best-effort and must never throw into app recovery flows.
  }
};

export const reportClientError = (
  { error, info, kind = 'react-error-boundary' } = {},
  { transport = defaultSendTelemetry, locationLike, isStandalone } = {},
) => {
  try {
    if (sessionReportCount >= MAX_SESSION_REPORTS) return false;

    const payload = sanitizeClientErrorPayload({
      error,
      info,
      kind,
      locationLike,
      isStandalone,
    });
    if (!payload) return false;

    const dedupeKey = `${payload.kind}:${payload.name}:${payload.message}`;
    if (reportedKeys.has(dedupeKey)) return false;

    reportedKeys.add(dedupeKey);
    sessionReportCount += 1;

    transport(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};

export const installGlobalErrorTelemetry = () => {
  if (typeof window === 'undefined' || listenersInstalled) return false;
  listenersInstalled = true;

  window.addEventListener('error', (event) => {
    reportClientError({
      error: event?.error || event?.message || 'Window error',
      kind: 'window-error',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError({
      error: event?.reason || 'Unhandled promise rejection',
      kind: 'unhandled-rejection',
    });
  });

  return true;
};

export const resetClientErrorTelemetryForTests = () => {
  reportedKeys.clear();
  sessionReportCount = 0;
  listenersInstalled = false;
};
