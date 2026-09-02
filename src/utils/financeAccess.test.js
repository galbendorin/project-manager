import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessFinancePlanner,
  hasPendingFinanceInvitation,
  normalizeFinanceHouseholdAccess,
} from './financeAccess.js';

test('finance access is derived from server-owned household access', () => {
  const access = normalizeFinanceHouseholdAccess({
    owner_user_id: 'owner-1',
    role: 'editor',
    is_owner: false,
    has_access: true,
  });

  assert.deepEqual(access, {
    ownerUserId: 'owner-1',
    role: 'editor',
    isOwner: false,
    hasAccess: true,
    pendingInvitationId: '',
    pendingInvitationExpiresAt: '',
  });
  assert.equal(canAccessFinancePlanner(access), true);
});

test('pending finance invitations do not grant data access before acceptance', () => {
  const access = normalizeFinanceHouseholdAccess({
    has_access: false,
    pending_invitation_id: 'invite-1',
    pending_invitation_expires_at: '2026-09-16T12:00:00Z',
  });

  assert.equal(canAccessFinancePlanner(access), false);
  assert.equal(hasPendingFinanceInvitation(access), true);
});

test('missing finance access stays private and unavailable', () => {
  const access = normalizeFinanceHouseholdAccess(null);

  assert.equal(canAccessFinancePlanner(access), false);
  assert.equal(hasPendingFinanceInvitation(access), false);
});
