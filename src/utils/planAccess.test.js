import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultUserProfile,
  getPlanLimits,
  isAdminEmail,
  resolveRealPlan,
} from './planAccess.js';

test('isAdminEmail matches configured admin accounts', () => {
  assert.equal(isAdminEmail('galben.dorin@yahoo.com'), true);
  assert.equal(isAdminEmail('GALBEN.DORIN@YAHOO.COM'), true);
  assert.equal(isAdminEmail('someone@example.com'), false);
});

test('resolveRealPlan returns team for admin users', () => {
  assert.equal(resolveRealPlan({ email: 'galben.dorin@yahoo.com', profile: null }), 'team');
});

test('resolveRealPlan keeps active trial users on trial', () => {
  const plan = resolveRealPlan({
    email: 'trial@example.com',
    profile: {
      plan: 'trial',
      trial_ends: '2099-01-01T00:00:00.000Z',
    },
    now: new Date('2026-04-14T00:00:00.000Z'),
  });

  assert.equal(plan, 'trial');
});

test('resolveRealPlan downgrades expired trials to starter', () => {
  const plan = resolveRealPlan({
    email: 'trial@example.com',
    profile: {
      plan: 'trial',
      trial_ends: '2026-01-01T00:00:00.000Z',
    },
    now: new Date('2026-04-14T00:00:00.000Z'),
  });

  assert.equal(plan, 'starter');
});

test('resolveRealPlan treats active pro subscriptions as pro', () => {
  const plan = resolveRealPlan({
    email: 'pro@example.com',
    profile: {
      plan: 'pro',
      subscription_status: 'active',
    },
  });

  assert.equal(plan, 'pro');
});

test('getPlanLimits returns starter defaults for unknown plans', () => {
  assert.equal(getPlanLimits('mystery').canUseAi, false);
});

test('buildDefaultUserProfile provisions a trial profile shape', () => {
  const profile = buildDefaultUserProfile('user-123', new Date('2026-04-14T09:00:00.000Z'));

  assert.equal(profile.id, 'user-123');
  assert.equal(profile.plan, 'trial');
  assert.equal(profile.subscription_status, 'trialing');
  assert.equal(profile.ai_reports_used, 0);
});
