import { createECDH } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPushSubscriptionsHandler,
  resolvePushSubscriptionWriteAction,
} from '../../api/push-subscriptions.js';
import { createShoppingListNotifyHandler } from '../../api/shopping-list-notify.js';
import {
  sendWebPushNotification,
  validateAndNormalizePushSubscription,
  validatePushEndpointUrl,
} from '../../api/_webPush.js';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const VALID_P256DH = ecdh.getPublicKey().toString('base64url');
const VALID_AUTH = Buffer.alloc(16, 7).toString('base64url');

const buildValidSubscription = (overrides = {}) => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc-123',
  expirationTime: null,
  keys: {
    p256dh: VALID_P256DH,
    auth: VALID_AUTH,
  },
  ...overrides,
});

const createMockRes = () => {
  const res = {
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
  };
  return res;
};

test('resolvePushSubscriptionWriteAction inserts when the endpoint is unclaimed', () => {
  const result = resolvePushSubscriptionWriteAction({
    existingUserId: null,
    currentUserId: 'user-1',
  });

  assert.deepEqual(result, {
    action: 'insert',
    reason: 'unclaimed-endpoint',
  });
});

test('resolvePushSubscriptionWriteAction updates when the endpoint already belongs to the same user', () => {
  const result = resolvePushSubscriptionWriteAction({
    existingUserId: 'user-1',
    currentUserId: 'user-1',
  });

  assert.deepEqual(result, {
    action: 'update',
    reason: 'same-user',
  });
});

test('resolvePushSubscriptionWriteAction rejects cross-account endpoint takeover attempts', () => {
  const result = resolvePushSubscriptionWriteAction({
    existingUserId: 'user-1',
    currentUserId: 'user-2',
  });

  assert.deepEqual(result, {
    action: 'reject',
    reason: 'claimed-by-other-user',
  });
});

test('validatePushEndpointUrl accepts known browser push services', () => {
  const validEndpoints = [
    'https://fcm.googleapis.com/fcm/send/token-1',
    'https://web.push.apple.com/QABCD1234',
    'https://updates.push.services.mozilla.com/wpush/v2/token-1',
    'https://wns2-bn3p.notify.windows.com/w/?token=abc',
    'https://android.googleapis.com:443/gcm/send/token-1',
  ];

  for (const endpoint of validEndpoints) {
    assert.ok(validatePushEndpointUrl(endpoint).startsWith('https://'));
  }
});

test('validatePushEndpointUrl rejects SSRF, non-HTTPS, custom ports, IP literals, and lookalike hosts', () => {
  const badEndpoints = [
    'http://fcm.googleapis.com/fcm/send/token',
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1/push',
    'https://[::1]/push',
    'https://localhost/push',
    'https://user:pass@fcm.googleapis.com/fcm/send/token',
    'https://fcm.googleapis.com:8443/fcm/send/token',
    'https://evilfcm.googleapis.com/push',
    'https://notify.windows.com.attacker.example/push',
    'https://fcm.googleapis.com./fcm/send/token',
    `https://fcm.googleapis.com/${'a'.repeat(2050)}`,
  ];

  for (const endpoint of badEndpoints) {
    assert.throws(
      () => validatePushEndpointUrl(endpoint),
      (error) => error?.code === 'invalid_push_subscription' && error?.statusCode === 410,
      `Expected rejection for ${endpoint}`,
    );
  }
});

test('validateAndNormalizePushSubscription checks decoded key lengths and expirationTime', () => {
  const normalized = validateAndNormalizePushSubscription(buildValidSubscription());
  assert.equal(normalized.endpoint, 'https://fcm.googleapis.com/fcm/send/abc-123');
  assert.equal(normalized.expirationTime, null);
  assert.equal(normalized.keys.p256dh, VALID_P256DH);
  assert.equal(normalized.keys.auth, VALID_AUTH);

  assert.throws(() => validateAndNormalizePushSubscription({
    ...buildValidSubscription(),
    keys: {
      p256dh: Buffer.alloc(32, 1).toString('base64url'),
      auth: VALID_AUTH,
    },
  }));

  assert.throws(() => validateAndNormalizePushSubscription({
    ...buildValidSubscription(),
    keys: {
      p256dh: VALID_P256DH,
      auth: Buffer.alloc(12, 1).toString('base64url'),
    },
  }));

  assert.throws(() => validateAndNormalizePushSubscription({
    ...buildValidSubscription(),
    keys: {
      p256dh: Buffer.alloc(65, 4).toString('base64url'),
      auth: VALID_AUTH,
    },
  }));

  assert.throws(() => validateAndNormalizePushSubscription(buildValidSubscription({ expirationTime: -1 })));
});

test('sendWebPushNotification rejects tampered subscriptions cleanly before network calls', async () => {
  await assert.rejects(
    () => sendWebPushNotification({
      subscription: buildValidSubscription({ endpoint: 'http://169.254.169.254/latest/meta-data/' }),
      payload: { title: 'Test' },
    }),
    (error) => {
      if (error?.message === 'Web push is not configured.') return true;
      return error?.code === 'invalid_push_subscription' && error?.statusCode === 410;
    },
  );
});

test('createPushSubscriptionsHandler rejects invalid SSRF endpoints and bad keys with 400 and enforces strictShared', async () => {
  let seenStrictShared = null;
  const supabaseStub = {
    from() {
      throw new Error('Supabase should not be queried for invalid push input');
    },
  };
  const handler = createPushSubscriptionsHandler({
    supabase: supabaseStub,
    applyCors: () => {},
    requireUser: async () => ({ id: 'user-1' }),
    rateLimit: async (opts) => {
      seenStrictShared = opts.strictShared;
      return { ok: true };
    },
  });

  const ssrfRes = createMockRes();
  await handler(
    {
      method: 'POST',
      headers: {},
      body: {
        subscription: buildValidSubscription({ endpoint: 'https://169.254.169.254/latest/meta-data/' }),
      },
    },
    ssrfRes,
  );
  assert.equal(ssrfRes.statusCode, 400);
  assert.equal(seenStrictShared, true);

  const badKeysRes = createMockRes();
  await handler(
    {
      method: 'POST',
      headers: {},
      body: {
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc-123',
          keys: { p256dh: 'short', auth: 'short' },
        },
      },
    },
    badKeysRes,
  );
  assert.equal(badKeysRes.statusCode, 400);

  const badDeleteRes = createMockRes();
  await handler(
    {
      method: 'DELETE',
      headers: {},
      body: { endpoint: 'http://127.0.0.1/push' },
    },
    badDeleteRes,
  );
  assert.equal(badDeleteRes.statusCode, 400);
});

test('createShoppingListNotifyHandler rejects invalid test endpoints with 400 and deactivates tampered stored rows on 410', async () => {
  let seenStrictShared = null;
  const deactivatedEndpoints = [];

  const handler = createShoppingListNotifyHandler({
    supabase: {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          async then() {},
        };
      },
    },
    applyCors: () => {},
    requireUser: async () => ({ id: 'user-1', email: 'u@example.com' }),
    rateLimit: async (opts) => {
      seenStrictShared = opts.strictShared;
      return { ok: true };
    },
    isPushConfigured: () => true,
    sendPush: async ({ subscription }) => {
      validateAndNormalizePushSubscription(subscription);
      return {};
    },
    deactivatePush: async (endpoint) => {
      deactivatedEndpoints.push(endpoint);
    },
  });

  const badTestRes = createMockRes();
  await handler(
    {
      method: 'POST',
      headers: {},
      body: {
        test: true,
        endpoint: 'https://127.0.0.1/evil',
      },
    },
    badTestRes,
  );
  assert.equal(badTestRes.statusCode, 400);
  assert.equal(seenStrictShared, true);

  const tamperedNotifyHandler = createShoppingListNotifyHandler({
    supabase: {
      from(table) {
        if (table === 'projects') {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({ data: { id: 'proj-1', user_id: 'user-1', name: 'Shopping' }, error: null }),
          };
        }
        if (table === 'project_members') {
          return {
            select() { return this; },
            eq: async () => ({ data: [{ user_id: 'user-2' }], error: null }),
          };
        }
        return {
          select() { return this; },
          in() { return this; },
          eq: async () => ({
            data: [
              {
                endpoint: 'https://169.254.169.254/tampered',
                subscription: buildValidSubscription({ endpoint: 'https://169.254.169.254/tampered' }),
              },
            ],
            error: null,
          }),
        };
      },
    },
    applyCors: () => {},
    requireUser: async () => ({ id: 'user-1', email: 'u@example.com' }),
    rateLimit: async () => ({ ok: true }),
    isPushConfigured: () => true,
    sendPush: async ({ subscription }) => {
      validateAndNormalizePushSubscription(subscription);
      return {};
    },
    deactivatePush: async (endpoint) => {
      deactivatedEndpoints.push(endpoint);
    },
  });

  const notifyRes = createMockRes();
  await tamperedNotifyHandler(
    {
      method: 'POST',
      headers: {},
      body: {
        projectId: 'proj-1',
        itemTitles: ['Milk'],
        eventType: 'added',
      },
    },
    notifyRes,
  );
  assert.equal(notifyRes.statusCode, 200);
  assert.deepEqual(notifyRes.body, { ok: true, sent: 0, failed: 1 });
  assert.deepEqual(deactivatedEndpoints, ['https://169.254.169.254/tampered']);
});
