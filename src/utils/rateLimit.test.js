import test from 'node:test';
import assert from 'node:assert/strict';

import { checkRateLimit, resetRateLimitStateForTests } from '../../api/_rateLimit.js';
import { shouldUseStrictSharedMealEstimateRateLimit } from '../../api/meal-estimate-calories.js';

test('checkRateLimit local fallback allows requests under the cap', async () => {
  resetRateLimitStateForTests();

  const first = await checkRateLimit({
    key: 'test:under-cap',
    max: 2,
    windowMs: 10_000,
  });

  const second = await checkRateLimit({
    key: 'test:under-cap',
    max: 2,
    windowMs: 10_000,
  });

  assert.equal(first.ok, true);
  assert.equal(first.remaining, 1);
  assert.equal(first.mode, 'local-fallback');
  assert.equal(second.ok, true);
  assert.equal(second.remaining, 0);
});

test('checkRateLimit local fallback blocks requests over the cap', async () => {
  resetRateLimitStateForTests();

  await checkRateLimit({
    key: 'test:over-cap',
    max: 1,
    windowMs: 10_000,
  });

  const blocked = await checkRateLimit({
    key: 'test:over-cap',
    max: 1,
    windowMs: 10_000,
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.mode, 'local-fallback');
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test('checkRateLimit can require the shared limiter for sensitive production routes', async () => {
  resetRateLimitStateForTests();

  const blocked = await checkRateLimit({
    key: 'test:shared-required',
    max: 5,
    windowMs: 10_000,
    strictShared: true,
    enforceStrictShared: true,
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.mode, 'shared-required-unavailable');
  assert.equal(blocked.status, 503);
  assert.equal(blocked.reason, 'missing-admin-client');
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test('meal calorie estimates use local fallback when the request comes from localhost', () => {
  assert.equal(shouldUseStrictSharedMealEstimateRateLimit({
    headers: {
      host: 'localhost:3001',
      origin: 'http://localhost:3002',
    },
  }), false);
});

test('meal calorie estimates still allow fallback for non-local requests', () => {
  assert.equal(shouldUseStrictSharedMealEstimateRateLimit({
    headers: {
      host: 'pmworkspace.com',
      origin: 'https://pmworkspace.com',
    },
  }), false);
});
