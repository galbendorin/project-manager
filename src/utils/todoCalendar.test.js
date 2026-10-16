import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarEntries, calendarOverlaps, calendarTimePassed, calendarWeek, layoutCalendarDay, matchesPreferenceSnapshot, preferenceSnapshot, validCalendarSlot } from './todoCalendar.js';
const id = '11111111-1111-4111-8111-111111111111';
const task = { _id: id, status: 'Open', title: 'Return trainers', dueDate: '2026-10-13' };
const preference = { id, version: 1, planned_day: '2026-10-14', planned_start_minute: 600, planned_duration_minutes: 30 };
test('Calendar uses one personal Wednesday entry without changing Tuesday deadline', () => {
  const entries = calendarEntries([task, task, { ...task, _id: 'undated', dueDate: '' }, { ...task, _id: 'done', status: 'Done' }], { [`manual:${id}`]: preference });
  assert.equal(entries.length, 1); assert.equal(entries[0].day, '2026-10-14'); assert.equal(entries[0].start, 600); assert.equal(task.dueDate, '2026-10-13');
  assert.equal(calendarEntries([task], {})[0].day, '2026-10-13');
});
test('half-hour boundaries and duration finish at 23:00', () => {
  for (const [start, duration] of [[360, 30], [1350, 30], [360, 1020]]) assert.equal(validCalendarSlot('2026-10-14', start, duration), true);
  for (const [start, duration] of [[330, 30], [1350, 60], [600, 0], [600, 45], [615, 30], [600.5, 30], [null, null]]) assert.equal(validCalendarSlot('2026-10-14', start, duration), false);
  assert.equal(validCalendarSlot('2026-02-31', 600, 30), false);
});
test('overlap lanes include hidden tasks but adjacent blocks do not clash', () => {
  const entry = (name, start, duration) => ({ todo: { ...task, _id: name }, day: '2026-10-14', start, duration });
  const a = entry('a', 600, 90), b = entry('b', 630, 30), c = entry('c', 690, 30);
  assert.equal(calendarOverlaps(a, b), true); assert.equal(calendarOverlaps(a, c), false);
  const layout = layoutCalendarDay([c, b, a]);
  assert.deepEqual(layout.map(e => [e.todo._id, e.lane, e.lanes]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
});
test('elapsed reservations remain incomplete and civil weeks span DST correctly', () => {
  const entry = calendarEntries([task], { [`manual:${id}`]: preference })[0];
  assert.equal(calendarTimePassed(entry, new Date(2026, 9, 14, 10, 29)), false);
  assert.equal(calendarTimePassed(entry, new Date(2026, 9, 14, 10, 30)), true);
  assert.equal(task.status, 'Open');
  assert.deepEqual(calendarWeek('2026-10-25'), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
});
test('snapshots detect time-only changes at the same personal day', () => {
  assert.equal(matchesPreferenceSnapshot(preference, preferenceSnapshot(preference)), true);
  assert.equal(matchesPreferenceSnapshot({ ...preference, planned_start_minute: 630 }, preferenceSnapshot(preference)), false);
});
