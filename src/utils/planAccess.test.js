import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultUserProfile,
  canAccessHouseholdTools,
  canUsePlatformAi,
  getPlanLimits,
  isAdminProfile,
  resolveRealPlan,
} from './planAccess.js';

test('isAdminProfile reads the server-managed admin flags from the profile', () => {
  assert.equal(isAdminProfile({ is_admin: true }), true);
  assert.equal(isAdminProfile({ is_platform_admin: true }), true);
  assert.equal(isAdminProfile({ is_admin: false, is_platform_admin: false }), false);
  assert.equal(isAdminProfile(null), false);
});

test('resolveRealPlan returns team for platform admin profiles', () => {
  assert.equal(resolveRealPlan({
    profile: {
      plan: 'starter',
      is_admin: true,
    },
  }), 'team');
});

test('resolveRealPlan keeps active trial users on trial', () => {
  const plan = resolveRealPlan({
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
  assert.equal(profile.is_admin, false);
  assert.equal(profile.household_tools_enabled, false);
  assert.equal(profile.platform_ai_enabled, true);
  assert.equal(profile.is_platform_admin, false);
});

test('household and platform AI access follow the stored profile flags', () => {
  assert.equal(canAccessHouseholdTools({ household_tools_enabled: true }), true);
  assert.equal(canAccessHouseholdTools({ is_admin: true }), true);
  assert.equal(canAccessHouseholdTools({ is_platform_admin: true }), true);
  assert.equal(canAccessHouseholdTools({ household_tools_enabled: false, is_admin: false }), false);
  assert.equal(canUsePlatformAi({ platform_ai_enabled: true }), true);
  assert.equal(canUsePlatformAi({ platform_ai_enabled: false }), false);
});
