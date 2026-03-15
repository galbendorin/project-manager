import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIAL_LENGTH_DAYS,
  TRIAL_OFFER_LABEL,
  TRIAL_SHORT_LABEL,
  TRIAL_FULL_ACCESS_LABEL,
  getTrialEndDate,
} from './trialOffer.js';

test('trial offer constants stay aligned with the 90-day rollout', () => {
  assert.equal(TRIAL_LENGTH_DAYS, 90);
  assert.equal(TRIAL_SHORT_LABEL, '90-day');
  assert.equal(TRIAL_OFFER_LABEL, '90-day free trial');
  assert.equal(TRIAL_FULL_ACCESS_LABEL, 'Use the full Pro feature set for 90 days');
});

test('getTrialEndDate adds the configured trial duration', () => {
  const start = new Date('2026-03-15T12:00:00.000Z');
  const end = getTrialEndDate(start);

  assert.equal(end.toISOString(), '2026-06-13T12:00:00.000Z');
});
