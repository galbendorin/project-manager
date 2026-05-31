import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWeightTrendBuckets,
  convertWeightFromKg,
  convertWeightToKg,
  formatWeightValue,
  normalizeWeightUnit,
  parseWeightInput,
  summarizeWeightEntries,
} from './weightTracker.js';

test('weight unit helpers normalize and convert values', () => {
  assert.equal(normalizeWeightUnit('LB'), 'lb');
  assert.equal(normalizeWeightUnit('stone'), 'kg');
  assert.equal(Math.round(convertWeightToKg(220.46, 'lb')), 100);
  assert.equal(Math.round(convertWeightFromKg(100, 'lb')), 220);
  assert.equal(formatWeightValue(80, 'kg'), '80 kg');
});

test('parseWeightInput accepts decimal commas and rejects invalid values', () => {
  assert.equal(parseWeightInput('82,4'), 82.4);
  assert.equal(parseWeightInput('82.4'), 82.4);
  assert.equal(parseWeightInput(''), null);
  assert.equal(parseWeightInput('-1'), null);
});

test('summarizeWeightEntries reports latest, weekly average, deltas, and goal progress', () => {
  const summary = summarizeWeightEntries({
    today: '2026-05-30',
    unit: 'kg',
    goalWeightKg: 75,
    entries: [
      { id: 'old', measuredOn: '2026-05-01', weightKg: 82 },
      { id: 'mid', measuredOn: '2026-05-25', weightKg: 80 },
      { id: 'now', measuredOn: '2026-05-30', weightKg: 79 },
    ],
  });

  assert.equal(summary.count, 3);
  assert.equal(summary.latest.id, 'now');
  assert.equal(summary.weekAverageKg, 79.5);
  assert.equal(summary.changeSincePreviousKg, -1);
  assert.equal(summary.changeSinceFirstKg, -3);
  assert.equal(summary.goalRemainingKg, 4);
  assert.equal(summary.goalProgress, 43);
});

test('buildWeightTrendBuckets groups entries into weekly averages', () => {
  const buckets = buildWeightTrendBuckets({
    endDate: '2026-05-30',
    weeks: 2,
    entries: [
      { measuredOn: '2026-05-24', weightKg: 80 },
      { measuredOn: '2026-05-25', weightKg: 79 },
      { measuredOn: '2026-05-30', weightKg: 78 },
    ],
  });

  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].count, 2);
  assert.equal(buckets[0].averageKg, 79.5);
  assert.equal(buckets[1].count, 1);
  assert.equal(buckets[1].averageKg, 78);
});
