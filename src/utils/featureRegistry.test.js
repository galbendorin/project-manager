import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FEATURE_ACCESS,
  buildAdminHealthSnapshot,
  getFeatureByRoute,
  getProjectHomeLaunchFeatures,
  isHouseholdFeaturePath,
} from './featureRegistry.js';

test('feature registry keeps household tools gated by route', () => {
  assert.equal(isHouseholdFeaturePath('/shopping'), true);
  assert.equal(isHouseholdFeaturePath('/meals/'), true);
  assert.equal(isHouseholdFeaturePath('/baby'), true);
  assert.equal(isHouseholdFeaturePath('/habits'), true);
  assert.equal(isHouseholdFeaturePath('/weight'), true);
  assert.equal(isHouseholdFeaturePath('/track'), false);
});

test('feature registry resolves launch metadata without exposing household tools by default', () => {
  assert.equal(getFeatureByRoute('/meals')?.label, 'Meal Planner');
  assert.equal(getFeatureByRoute('/track')?.access, FEATURE_ACCESS.authenticated);

  const publicLaunches = getProjectHomeLaunchFeatures({ includeHouseholdTools: false });
  assert.deepEqual(publicLaunches.map((feature) => feature.id), ['timesheets']);

  const allowedPrivateLaunches = getProjectHomeLaunchFeatures({
    includeHouseholdTools: false,
    includeItilQuiz: true,
  });
  assert.deepEqual(allowedPrivateLaunches.map((feature) => feature.id), ['itil-quiz', 'timesheets']);

  const householdLaunches = getProjectHomeLaunchFeatures({
    includeHouseholdTools: true,
    includeItilQuiz: true,
  });
  assert.deepEqual(householdLaunches.map((feature) => feature.id), [
    'meal-planner',
    'shopping-list',
    'baby',
    'habits',
    'weight',
    'itil-quiz',
    'timesheets',
  ]);
});

test('admin health snapshot reports configuration without returning secret values', () => {
  const snapshot = buildAdminHealthSnapshot({
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'secret-token',
    },
    effectivePlan: 'team',
    hasSharedHouseholdProjectAccess: true,
    householdToolsEnabled: true,
    isAdmin: true,
    isOnline: true,
    limits: { maxProjects: 999 },
    profile: { id: 'profile-1' },
    projectCount: 4,
    canUsePlatformAi: true,
  });

  assert.equal(snapshot.status, 'ok');
  assert.equal(snapshot.checks.find((check) => check.id === 'supabase-client-env')?.status, 'ok');
  assert.equal(JSON.stringify(snapshot).includes('secret-token'), false);
});
