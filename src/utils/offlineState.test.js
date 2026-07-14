import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHouseholdAccessKey,
  shouldClearUserOfflineKey,
} from './offlineState.js';

test('buildHouseholdAccessKey scopes remembered access to one account', () => {
  assert.equal(
    buildHouseholdAccessKey('user-1'),
    'pmworkspace:household-access:v1:user-1'
  );
});

test('shouldClearUserOfflineKey removes signed-out user data and navigation state', () => {
  assert.equal(shouldClearUserOfflineKey('pmworkspace:shopping-offline:v1:user-1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:timesheet-offline:v1:user-1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:offline:project:v1:user-1:project-1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:itil-foundation-quiz:user-1:v1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:household-access:v1:user-1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:last-project:v1', 'user-1'), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:last-path:v1', 'user-1'), true);
});

test('shouldClearUserOfflineKey never removes another account cache or harmless preferences', () => {
  assert.equal(shouldClearUserOfflineKey('pmworkspace:shopping-offline:v1:user-2', 'user-1'), false);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:shopping-ui:v1', 'user-1'), false);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:shopping-offline:v1:user-1', ''), false);
});
