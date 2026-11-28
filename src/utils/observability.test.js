import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRequestId,
  logServerError,
  logServerInfo,
  recordServerMetric,
  sanitizeLogMeta,
  serializeError,
} from '../../api/_observability.js';
import {
  createClientErrorHandler,
  createHealthHandler,
} from '../../api/_health.js';
import { createPushSubscriptionsHandler } from '../../api/push-subscriptions.js';
import {
  reportClientError,
  resetClientErrorTelemetryForTests,
  sanitizeClientErrorPayload,
} from './clientErrorTelemetry.js';

const createMockRes = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  ended: false,
  setHeader(name, value) {
    this.headers[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
  end() {
    this.ended = true;
    return this;
  },
});

test('observability helpers redact secrets, format structured JSON logs, and swallow metric failures', () => {
  const clean = sanitizeLogMeta({
    reminderId: 'rem-1',
    skippedUnauthorized: 2,
    auth: 'web-push-auth-secret',
    token: 'secret-token-value',
    authorization: 'Bearer abc.def.ghi',
    userEmail: 'person@example.com',
    nested: {
      note: 'Reach out to alice@example.com at https://example.com/habits?code=secret',
      apiKey: 'sk-123',
    },
  });

  assert.equal(clean.reminderId, 'rem-1');
  assert.equal(clean.skippedUnauthorized, 2);
  assert.equal('auth' in clean, false);
  assert.equal('token' in clean, false);
  assert.equal('authorization' in clean, false);
  assert.equal('userEmail' in clean, false);
  assert.equal(clean.nested.note, 'Reach out to [redacted-email] at https://example.com/habits?[redacted]');
  assert.equal('apiKey' in clean.nested, false);

  const err = Object.assign(new Error('Failed with Bearer topsecret123'), {
    name: 'UpstreamError',
    code: 'ECONNRESET',
    statusCode: 502,
  });
  assert.deepEqual(serializeError(err), {
    name: 'UpstreamError',
    message: 'Failed with Bearer [redacted]',
    code: 'ECONNRESET',
    status: 502,
  });

  const loggedLines = [];
  const fakeLogger = {
    info: (line) => loggedLines.push({ stream: 'info', line }),
    warn: (line) => loggedLines.push({ stream: 'warn', line }),
    error: (line) => loggedLines.push({ stream: 'error', line }),
  };

  logServerInfo({
    event: 'test.ok',
    route: '/api/health',
    req: { headers: { 'x-vercel-id': 'iad1::req-123' } },
    durationMs: 14.6,
    status: 200,
    logger: fakeLogger,
  });
  logServerError({
    event: 'test.err',
    route: '/api/ai-generate',
    req: { headers: { 'x-request-id': 'req-456' } },
    error: err,
    status: 502,
    logger: fakeLogger,
  });

  assert.equal(getRequestId({ headers: { 'x-vercel-id': 'abc' } }), 'abc');
  assert.equal(loggedLines.length, 2);
  const parsedInfo = JSON.parse(loggedLines[0].line);
  assert.equal(parsedInfo.level, 'info');
  assert.equal(parsedInfo.requestId, 'iad1::req-123');
  assert.equal(parsedInfo.durationMs, 15);
  assert.equal(parsedInfo.status, 200);

  const parsedErr = JSON.parse(loggedLines[1].line);
  assert.equal(parsedErr.level, 'error');
  assert.equal(parsedErr.error.message, 'Failed with Bearer [redacted]');

  const recorded = [];
  assert.equal(
    recordServerMetric(
      'billing.checkout',
      1,
      { plan: 'monthly', test: true, retries: 2, token: 'hidden', outcome: 'created' },
      { metricFn: (name, value, attrs) => recorded.push({ name, value, attrs }) },
    ),
    true,
  );
  assert.deepEqual(recorded, [
    { name: 'billing.checkout', value: 1, attrs: { plan: 'monthly', test: 'true', retries: '2', outcome: 'created' } },
  ]);

  assert.equal(
    recordServerMetric('billing.checkout', 1, {}, {
      metricFn: () => { throw new Error('telemetry failure'); },
    }),
    false,
  );
});

test('createHealthHandler reports 200 when Supabase is healthy, 503 when degraded/timed out, and supports HEAD', async () => {
  const okHandler = createHealthHandler({
    supabase: {
      from() {
        return {
          select() { return this; },
          limit: async () => ({ error: null }),
        };
      },
    },
    isPushConfigured: () => true,
    env: {
      VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890',
      STRIPE_SECRET_KEY: 'sk_test_value',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_value',
      PLATFORM_AI_KEY: 'ai_key_value',
    },
  });

  const okRes = createMockRes();
  await okHandler({ method: 'GET', headers: {} }, okRes);
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.headers['Cache-Control'], 'no-store');
  assert.equal(okRes.body.ok, true);
  assert.equal(okRes.body.version, 'abcdef123456');
  assert.deepEqual(okRes.body.checks, {
    supabase: 'ok',
    webPush: 'configured',
    billing: 'configured',
    ai: 'configured',
  });
  assert.equal(JSON.stringify(okRes.body).includes('sk_test_value'), false);

  const headRes = createMockRes();
  await okHandler({ method: 'HEAD', headers: {} }, headRes);
  assert.equal(headRes.statusCode, 200);
  assert.equal(headRes.ended, true);
  assert.equal(headRes.body, null);

  const timeoutHandler = createHealthHandler({
    supabase: {
      from() {
        return {
          select() { return this; },
          limit: () => new Promise(() => {}),
        };
      },
    },
    isPushConfigured: () => false,
    env: { ANTHROPIC_API_KEY: 'unused-for-platform-ai' },
    timeoutMs: 25,
  });

  const timeoutRes = createMockRes();
  await timeoutHandler({ method: 'GET', headers: {} }, timeoutRes);
  assert.equal(timeoutRes.statusCode, 503);
  assert.equal(timeoutRes.body.ok, false);
  assert.equal(timeoutRes.body.status, 'degraded');
  assert.equal(timeoutRes.body.checks.supabase, 'error');
  assert.equal(timeoutRes.body.checks.ai, 'unconfigured');

  const methodRes = createMockRes();
  await okHandler({ method: 'POST', headers: {} }, methodRes);
  assert.equal(methodRes.statusCode, 405);
});

test('createClientErrorHandler validates, redacts, rate-limits, and logs sanitized client errors', async () => {
  const logged = [];
  let seenRateLimitOpts = null;

  const handler = createClientErrorHandler({
    applyCors: () => {},
    rateLimit: async (opts) => {
      seenRateLimitOpts = opts;
      return { ok: true };
    },
    getIp: () => '203.0.113.10',
    logError: (entry) => logged.push(entry),
  });

  const beaconRes = createMockRes();
  await handler(
    {
      method: 'POST',
      headers: { 'x-vercel-id': 'req-client-1' },
      body: JSON.stringify({
        kind: 'unexpected-kind',
        name: 'TypeError',
        message: 'Cannot read user bob@example.com with Bearer secret123',
        route: 'https://pmworkspace.com/habits?token=abc#section',
        isStandalone: true,
        componentStack: 'at HabitsView',
      }),
    },
    beaconRes,
  );

  assert.equal(beaconRes.statusCode, 202);
  assert.deepEqual(beaconRes.body, { ok: true });
  assert.equal(seenRateLimitOpts.strictShared, true);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].event, 'client.error');
  assert.equal(logged[0].meta.kind, 'react-error-boundary');
  assert.equal(logged[0].meta.route, '/habits');
  assert.equal(logged[0].meta.message, 'Cannot read user [redacted-email] with Bearer [redacted]');
  assert.equal(logged[0].meta.isStandalone, true);

  const missingMsgRes = createMockRes();
  await handler({ method: 'POST', headers: {}, body: { message: '   ' } }, missingMsgRes);
  assert.equal(missingMsgRes.statusCode, 400);

  const badJsonRes = createMockRes();
  await handler({ method: 'POST', headers: {}, body: '{not-json' }, badJsonRes);
  assert.equal(badJsonRes.statusCode, 400);

  const limitedHandler = createClientErrorHandler({
    applyCors: () => {},
    rateLimit: async () => ({ ok: false, retryAfterSeconds: 30 }),
  });
  const limitedRes = createMockRes();
  await limitedHandler({ method: 'POST', headers: {}, body: { message: 'Boom' } }, limitedRes);
  assert.equal(limitedRes.statusCode, 429);
});

test('createPushSubscriptionsHandler routes ?op=health and ?op=client-error cleanly without disturbing push routes', async () => {
  let healthCalled = 0;
  let clientErrorCalled = 0;

  const handler = createPushSubscriptionsHandler({
    applyCors: () => {},
    isPushConfigured: () => true,
    getPublicKey: () => 'pub-key-123',
    handleHealth: async (_req, res) => {
      healthCalled += 1;
      return res.status(200).json({ ok: true, status: 'ok' });
    },
    handleClientError: async (_req, res) => {
      clientErrorCalled += 1;
      return res.status(202).json({ ok: true });
    },
  });

  const healthRes = createMockRes();
  await handler({ method: 'GET', url: '/api/push-subscriptions?op=health', headers: {} }, healthRes);
  assert.equal(healthCalled, 1);
  assert.equal(healthRes.statusCode, 200);

  const clientErrorRes = createMockRes();
  await handler(
    { method: 'POST', query: { op: ['ignored', 'client-error'] }, url: '/api/push-subscriptions?op=client-error', headers: {} },
    clientErrorRes,
  );
  assert.equal(clientErrorCalled, 1);
  assert.equal(clientErrorRes.statusCode, 202);

  const publicKeyRes = createMockRes();
  await handler({ method: 'GET', url: '/api/push-subscriptions', headers: {} }, publicKeyRes);
  assert.equal(publicKeyRes.statusCode, 200);
  assert.equal(publicKeyRes.body.publicKey, 'pub-key-123');
});

test('clientErrorTelemetry sanitizes routes, deduplicates, ignores ResizeObserver noise, and caps reports per session', () => {
  resetClientErrorTelemetryForTests();
  const sent = [];

  const benign = sanitizeClientErrorPayload({
    error: new Error('ResizeObserver loop completed with undelivered notifications.'),
    kind: 'window-error',
    locationLike: { pathname: '/habits', search: '?secret=1' },
  });
  assert.equal(benign, null);

  const firstOk = reportClientError(
    {
      error: new Error('Failed for alice@example.com with Bearer token123'),
      info: { componentStack: '\n  at HabitsView\n' },
      kind: 'react-error-boundary',
    },
    {
      transport: (body) => sent.push(JSON.parse(body)),
      locationLike: { pathname: '/habits', search: '?invite=secret' },
      isStandalone: true,
    },
  );
  assert.equal(firstOk, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].route, '/habits');
  assert.equal(sent[0].message, 'Failed for [redacted-email] with Bearer [redacted]');
  assert.equal(sent[0].isStandalone, true);

  // Duplicate error within session must be ignored.
  assert.equal(
    reportClientError(
      { error: new Error('Failed for alice@example.com with Bearer token123'), kind: 'react-error-boundary' },
      { transport: (body) => sent.push(JSON.parse(body)) },
    ),
    false,
  );
  assert.equal(sent.length, 1);

  // Cap at 5 total reports per session.
  for (let i = 2; i <= 6; i += 1) {
    const result = reportClientError(
      { error: new Error(`Unique error ${i}`), kind: 'window-error' },
      { transport: (body) => sent.push(JSON.parse(body)), locationLike: { pathname: '/track' } },
    );
    assert.equal(result, i <= 5);
  }
  assert.equal(sent.length, 5);

  // Transport errors are swallowed cleanly.
  resetClientErrorTelemetryForTests();
  assert.equal(
    reportClientError(
      { error: new Error('Transport throw check') },
      { transport: () => { throw new Error('network blocked'); }, locationLike: { pathname: '/track' } },
    ),
    false,
  );
});
