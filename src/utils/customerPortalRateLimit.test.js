import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTOMER_PORTAL_RATE_LIMIT,
  buildCustomerPortalRateLimitKey,
} from '../../api/billingRateLimit.js';

test('customer portal rate limit uses a strict user and IP scoped key', () => {
  assert.equal(
    buildCustomerPortalRateLimitKey('user-123', '203.0.113.9'),
    'customer-portal:user-123:203.0.113.9',
  );
  assert.deepEqual(CUSTOMER_PORTAL_RATE_LIMIT, {
    max: 10,
    windowMs: 60_000,
    strictShared: true,
  });
});
