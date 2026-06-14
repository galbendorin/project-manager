import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_REFRESH_FRESHNESS_MS,
  isFreshTimestamp,
  shouldRefreshAfterFocus,
} from './refreshThrottle.js';

test('shouldRefreshAfterFocus refreshes when there is no previous timestamp', () => {
  assert.equal(shouldRefreshAfterFocus('', 1_000, DEFAULT_REFRESH_FRESHNESS_MS), true);
  assert.equal(shouldRefreshAfterFocus(null, 1_000, DEFAULT_REFRESH_FRESHNESS_MS), true);
});

test('shouldRefreshAfterFocus skips reloads inside the freshness window', () => {
  assert.equal(shouldRefreshAfterFocus(1_000, 20_000, 30_000), false);
  assert.equal(shouldRefreshAfterFocus('2026-06-14T10:00:00.000Z', '2026-06-14T10:00:20.000Z', 30_000), false);
});

test('shouldRefreshAfterFocus reloads after the freshness window expires', () => {
  assert.equal(shouldRefreshAfterFocus(1_000, 31_000, 30_000), true);
  assert.equal(shouldRefreshAfterFocus('2026-06-14T10:00:00.000Z', '2026-06-14T10:00:31.000Z', 30_000), true);
});

test('isFreshTimestamp treats invalid values and disabled windows as stale', () => {
  assert.equal(isFreshTimestamp('not-a-date', 1_000, 30_000), false);
  assert.equal(isFreshTimestamp(1_000, 2_000, 0), false);
});
