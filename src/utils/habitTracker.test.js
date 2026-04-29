import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHabitTrendBuckets,
  cycleHabitStatus,
  getDueHabitReminders,
  getHabitStreak,
  getHabitWeekDays,
  getHabitWeekStart,
  isHabitReminderDueOnDate,
  isHabitSuccess,
  normalizeHabitReminderTime,
  normalizeHabitReminderWeekdays,
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

test('habit reminder helpers normalize time and weekdays', () => {
  assert.equal(normalizeHabitReminderTime('7:05:00'), '07:05');
  assert.equal(normalizeHabitReminderTime('25:99'), '23:59');
  assert.equal(normalizeHabitReminderTime('not a time'), '21:00');
  assert.deepEqual(normalizeHabitReminderWeekdays([1, 2, 2, 7, '3', -1]), [1, 2, 3]);
});

test('habit reminder due checks support daily, weekdays, and custom schedules', () => {
  assert.equal(isHabitReminderDueOnDate({ frequency: 'daily', isEnabled: true }, '2026-04-26'), true);
  assert.equal(isHabitReminderDueOnDate({ frequency: 'weekdays', isEnabled: true }, '2026-04-27'), true);
  assert.equal(isHabitReminderDueOnDate({ frequency: 'weekdays', isEnabled: true }, '2026-04-26'), false);
  assert.equal(isHabitReminderDueOnDate({ frequency: 'custom', weekdays: [0, 6], isEnabled: true }, '2026-04-26'), true);
  assert.equal(isHabitReminderDueOnDate({ frequency: 'custom', weekdays: [0, 6], isEnabled: true }, '2026-04-27'), false);
  assert.equal(isHabitReminderDueOnDate({ frequency: 'daily', isEnabled: false }, '2026-04-27'), false);
});

test('getDueHabitReminders returns reminders matching date and time', () => {
  const reminders = [
    { id: 'daily', reminderTime: '21:55', frequency: 'daily', isEnabled: true },
    { id: 'wrong-time', reminderTime: '21:56', frequency: 'daily', isEnabled: true },
    { id: 'weekend', reminderTime: '21:55', frequency: 'weekdays', isEnabled: true },
    { id: 'disabled', reminderTime: '21:55', frequency: 'daily', isEnabled: false },
  ];

  assert.deepEqual(
    getDueHabitReminders({ reminders, dateKey: '2026-04-27', time: '21:55' }).map((reminder) => reminder.id),
    ['daily', 'weekend']
  );
  assert.deepEqual(
    getDueHabitReminders({ reminders, dateKey: '2026-04-26', time: '21:55' }).map((reminder) => reminder.id),
    ['daily']
  );
});
