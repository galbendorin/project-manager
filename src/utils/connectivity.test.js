import test from 'node:test';
import assert from 'node:assert/strict';

import { isLikelyNetworkError } from './connectivity.js';

test('isLikelyNetworkError trusts an explicit offline browser state', () => {
  assert.equal(isLikelyNetworkError(new Error('Request failed'), { online: false }), true);
});

test('isLikelyNetworkError recognizes common mobile fetch failures', () => {
  assert.equal(isLikelyNetworkError(new TypeError('Failed to fetch'), { online: true }), true);
  assert.equal(isLikelyNetworkError(new Error('Load failed'), { online: true }), true);
  assert.equal(isLikelyNetworkError({ code: 'NETWORK_ERROR' }, { online: true }), true);
});

test('isLikelyNetworkError does not hide permission or validation errors', () => {
  assert.equal(isLikelyNetworkError({ code: '42501', message: 'row-level security policy' }, { online: true }), false);
  assert.equal(isLikelyNetworkError({ status: 400, message: 'Invalid grocery' }, { online: true }), false);
});
