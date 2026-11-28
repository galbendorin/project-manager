import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHabitTrendBuckets,
  cycleHabitStatus,
  evaluateHabitReminderSchedule,
  getDueHabitReminders,
  getHabitLocalClockParts,
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

test('getHabitLocalClockParts formats local wall clock and falls back safely for invalid timezones', () => {
  const summerUtc = new Date('2026-07-15T20:05:00Z');
  const london = getHabitLocalClockParts(summerUtc, 'Europe/London');
  assert.equal(london.dateKey, '2026-07-15');
  assert.equal(london.time, '21:05');
  assert.equal(london.minutesSinceMidnight, 21 * 60 + 5);
  assert.equal(london.timeZone, 'Europe/London');

  const newYork = getHabitLocalClockParts(summerUtc, 'America/New_York');
  assert.equal(newYork.dateKey, '2026-07-15');
  assert.equal(newYork.time, '16:05');

  const fallback = getHabitLocalClockParts(summerUtc, 'Not/A_Timezone');
  assert.equal(fallback.timeZone, 'Europe/London');
  assert.equal(fallback.time, '21:05');
});

test('evaluateHabitReminderSchedule enforces jitter window, midnight rollover, weekdays, and idempotency', () => {
  const reminder = {
    id: 'r1',
    reminder_time: '21:00:00',
    frequency: 'daily',
    timezone: 'Europe/London',
    is_enabled: true,
    last_triggered_date: null,
  };

  assert.deepEqual(
    evaluateHabitReminderSchedule({ reminder, now: new Date('2026-07-15T19:59:00Z') }).reason,
    'outside_window',
  );

  const dueBst = evaluateHabitReminderSchedule({ reminder, now: new Date('2026-07-15T20:14:00Z') });
  assert.equal(dueBst.due, true);
  assert.equal(dueBst.dateKey, '2026-07-15');
  assert.equal(dueBst.elapsedMinutes, 14);

  const dueWindowEdge = evaluateHabitReminderSchedule({ reminder, now: new Date('2026-07-15T21:00:00Z') });
  assert.equal(dueWindowEdge.due, true);

  const pastWindow = evaluateHabitReminderSchedule({ reminder, now: new Date('2026-07-15T21:01:00Z') });
  assert.equal(pastWindow.due, false);
  assert.equal(pastWindow.reason, 'outside_window');

  const alreadySent = evaluateHabitReminderSchedule({
    reminder: { ...reminder, last_triggered_date: '2026-07-15' },
    now: new Date('2026-07-15T20:20:00Z'),
  });
  assert.equal(alreadySent.due, false);
  assert.equal(alreadySent.reason, 'already_triggered');

  const lateReminder = {
    id: 'r2',
    reminder_time: '23:50:00',
    frequency: 'weekdays',
    timezone: 'Europe/London',
    is_enabled: true,
    last_triggered_date: null,
  };
  // 2026-11-28 is Saturday; 2026-11-27 is Friday (weekday). 00:05 GMT belongs to Friday's 23:50 occurrence.
  const rolloverDue = evaluateHabitReminderSchedule({
    reminder: lateReminder,
    now: new Date('2026-11-28T00:05:00Z'),
  });
  assert.equal(rolloverDue.due, true);
  assert.equal(rolloverDue.dateKey, '2026-11-27');
  assert.equal(rolloverDue.elapsedMinutes, 15);
});
