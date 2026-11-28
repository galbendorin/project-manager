import { applyApiCors, getAdminSupabase } from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';
import { isWebPushConfigured } from './_webPush.js';
import { logServerError, redactText } from './_observability.js';

const DEFAULT_HEALTH_TIMEOUT_MS = 3000;
const MAX_CLIENT_ERROR_BODY_BYTES = 16 * 1024;
const ALLOWED_CLIENT_ERROR_KINDS = new Set([
  'react-error-boundary',
  'unhandled-rejection',
  'window-error',
  'chunk-recovery',
]);

const defaultSupabase = getAdminSupabase();

const checkSupabaseWithTimeout = async (supabase, timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS) => {
  if (!supabase) return 'unconfigured';

  let timerId = null;
  try {
    const queryPromise = Promise.resolve(
      supabase
        .from('user_profiles')
        .select('id', { head: true, count: 'estimated' })
        .limit(1),
    );
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        const timeoutError = new Error('Supabase health check timed out');
        timeoutError.code = 'health_timeout';
        reject(timeoutError);
      }, timeoutMs);
    });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    return result?.error ? 'error' : 'ok';
  } catch {
    return 'error';
  } finally {
    if (timerId !== null) clearTimeout(timerId);
  }
};

const safeIsPushConfigured = (isPushConfigured) => {
  try {
    return Boolean(isPushConfigured?.());
  } catch {
    return false;
  }
};

const sanitizeRoutePath = (rawRoute = '') => {
  const value = String(rawRoute || '').trim();
  if (!value) return '/';
  try {
    const parsed = new URL(value, 'https://pmworkspace.local');
    return (parsed.pathname || '/').slice(0, 120);
  } catch {
    return '/';
  }
};

const parseJsonBody = (rawBody) => {
  if (rawBody === undefined || rawBody === null) return {};
  if (typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)) return rawBody;

  const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  if (text.length > MAX_CLIENT_ERROR_BODY_BYTES) {
    const tooLargeError = new Error('Payload too large');
    tooLargeError.statusCode = 413;
    throw tooLargeError;
  }
  if (!text.trim()) return {};
  return JSON.parse(text);
};

export const createHealthHandler = ({
  supabase = defaultSupabase,
  checkSupabase,
  isPushConfigured = isWebPushConfigured,
  env = process.env,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
} = {}) => async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!['GET', 'HEAD'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let supabaseStatus;
  if (typeof checkSupabase === 'function') {
    try {
      supabaseStatus = await checkSupabase();
    } catch {
      supabaseStatus = 'error';
    }
  } else {
    supabaseStatus = await checkSupabaseWithTimeout(supabase, timeoutMs);
  }

  const healthy = supabaseStatus === 'ok';
  const statusCode = healthy ? 200 : 503;

  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method === 'HEAD') {
    return res.status(statusCode).end();
  }

  const commitSha = String(env.VERCEL_GIT_COMMIT_SHA || '').trim();
  const billingConfigured = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
  const aiConfigured = Boolean(
    env.PLATFORM_AI_KEY
    || env.ANTHROPIC_API_KEY
    || env.OPENAI_API_KEY
    || env.GEMINI_API_KEY,
  );

  return res.status(statusCode).json({
    ok: healthy,
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: commitSha ? commitSha.slice(0, 12) : 'dev',
    checks: {
      supabase: supabaseStatus,
      webPush: safeIsPushConfigured(isPushConfigured) ? 'configured' : 'unconfigured',
      billing: billingConfigured ? 'configured' : 'unconfigured',
      ai: aiConfigured ? 'configured' : 'unconfigured',
    },
  });
};

export const createClientErrorHandler = ({
  applyCors = applyApiCors,
  rateLimit = checkRateLimit,
  getIp = getClientIp,
  sendRateLimit = sendRateLimitResponse,
  logError = logServerError,
} = {}) => async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limitResult = await rateLimit({
      key: `client-error:${getIp(req)}`,
      max: 20,
      windowMs: 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimit(res, limitResult, 'Too many error reports.');
    }

    let body;
    try {
      body = parseJsonBody(req.body);
    } catch (parseError) {
      const status = parseError?.statusCode === 413 ? 413 : 400;
      return res.status(status).json({ error: status === 413 ? 'Payload too large.' : 'Invalid JSON payload.' });
    }

    const rawMessage = String(body?.message || '').trim();
    if (!rawMessage) {
      return res.status(400).json({ error: 'Missing required field: message.' });
    }

    const sanitized = {
      kind: ALLOWED_CLIENT_ERROR_KINDS.has(body?.kind) ? body.kind : 'react-error-boundary',
      name: redactText(String(body?.name || 'Error').trim(), 80) || 'Error',
      message: redactText(rawMessage, 300),
      route: sanitizeRoutePath(body?.route),
      isStandalone: Boolean(body?.isStandalone),
      ...(body?.componentStack ? { componentStack: redactText(String(body.componentStack), 600) } : {}),
      ...(body?.release ? { release: redactText(String(body.release), 40) } : {}),
    };

    logError({
      event: 'client.error',
      route: '/api/client-error',
      req,
      status: 202,
      meta: sanitized,
    });

    return res.status(202).json({ ok: true });
  } catch (error) {
    logError({
      event: 'client_error.handler_failed',
      route: '/api/client-error',
      req,
      status: 500,
      error,
    });
    return res.status(500).json({ error: 'Unable to record error report.' });
  }
};
