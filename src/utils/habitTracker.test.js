import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHabitTrendBuckets,
  cycleHabitStatus,
  getHabitStreak,
  getHabitWeekDays,
  getHabitWeekStart,
  isHabitSuccess,
  summarizeHabitRange,
} from './habitTracker.js';

test('habit week helpers use Monday as the first day', () => {
  assert.equal(getHabitWeekStart('2026-04-29'), '2026-04-27');
  assert.equal(getHabitWeekStart('2026-05-03'), '2026-04-27');
  assert.deepEqual(
    getHabitWeekDays('2026-04-27').map((day) => day.dateKey),
    ['2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02', '2026-05-03']
  );
});

test('cycleHabitStatus rotates through yes, no, skip, and empty', () => {
  assert.equal(cycleHabitStatus(''), 'yes');
  assert.equal(cycleHabitStatus('yes'), 'no');
  assert.equal(cycleHabitStatus('no'), 'skip');
  assert.equal(cycleHabitStatus('skip'), '');
});

test('isHabitSuccess respects positive and negative habit direction', () => {
  assert.equal(isHabitSuccess({ direction: 'positive' }, 'yes'), true);
  assert.equal(isHabitSuccess({ direction: 'positive' }, 'no'), false);
  assert.equal(isHabitSuccess({ direction: 'negative' }, 'yes'), false);
  assert.equal(isHabitSuccess({ direction: 'negative' }, 'no'), true);
});

test('summarizeHabitRange calculates completion and success rates', () => {
  const habits = [
    { id: 'exercise', direction: 'positive' },
    { id: 'alcohol', direction: 'negative' },
  ];
  const entries = [
    { habitId: 'exercise', entryDate: '2026-04-27', status: 'yes' },
    { habitId: 'exercise', entryDate: '2026-04-28', status: 'no' },
    { habitId: 'alcohol', entryDate: '2026-04-27', status: 'no' },
    { habitId: 'alcohol', entryDate: '2026-04-28', status: 'skip' },
  ];

  assert.deepEqual(
    summarizeHabitRange({ habits, entries, startDate: '2026-04-27', endDate: '2026-04-28' }),
    {
      yes: 1,
      no: 2,
      skip: 1,
      success: 2,
      completed: 4,
      expected: 4,
      dayCount: 2,
      completionRate: 100,
      successRate: 50,
    }
  );
});

test('buildHabitTrendBuckets groups entries by week', () => {
  const buckets = buildHabitTrendBuckets({
    habit: { id: 'exercise', direction: 'positive' },
    endDate: '2026-04-29',
    weeks: 2,
    entries: [
      { habitId: 'exercise', entryDate: '2026-04-21', status: 'yes' },
      { habitId: 'exercise', entryDate: '2026-04-22', status: 'no' },
      { habitId: 'exercise', entryDate: '2026-04-29', status: 'yes' },
    ],
  });

  assert.equal(buckets[0].weekStart, '2026-04-20');
  assert.equal(buckets[0].yes, 1);
  assert.equal(buckets[0].no, 1);
  assert.equal(buckets[1].weekStart, '2026-04-27');
  assert.equal(buckets[1].yes, 1);
});

test('getHabitStreak counts consecutive successful days', () => {
  assert.equal(getHabitStreak({
    habit: { id: 'exercise', direction: 'positive' },
    endDate: '2026-04-29',
    entries: [
      { habitId: 'exercise', entryDate: '2026-04-27', status: 'yes' },
      { habitId: 'exercise', entryDate: '2026-04-28', status: 'yes' },
      { habitId: 'exercise', entryDate: '2026-04-29', status: 'yes' },
    ],
  }), 3);

  assert.equal(getHabitStreak({
    habit: { id: 'alcohol', direction: 'negative' },
    endDate: '2026-04-29',
    entries: [
      { habitId: 'alcohol', entryDate: '2026-04-28', status: 'no' },
      { habitId: 'alcohol', entryDate: '2026-04-29', status: 'no' },
    ],
  }), 2);
});
