import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePushSubscriptionWriteAction } from '../../api/push-subscriptions.js';

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
