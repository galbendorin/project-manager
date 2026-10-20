import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSleepMinuteSet, sleepEntryIntervalForDay, validateSleepEntry } from './babySleepEntries.js';
import { summarizeSleepBlocks, summarizeSleepGuidanceComparison, summarizeBabyDay, buildBabyActivityLog } from './babyTracker.js';
const date = '2026-10-20';
const nap = { id: 'nap', sleepDate: date, startMinute: 967, endMinute: 1003, notes: 'Journey interrupted sleep.' };
test('exact 16:07–16:43 retains 36 minutes, times and sessions throughout summaries and activity', () => {
  assert.deepEqual(validateSleepEntry(nap), { sleepDate: date, startMinute: 967, endMinute: 1003, notes: nap.notes });
  const result = summarizeSleepBlocks([], [nap], date);
  assert.equal(result.totalMinutes, 36);
  assert.equal(result.sessions[0].startTime, '16:07');
  assert.equal(result.sessions[0].endTime, '16:43');
  assert.equal(result.daytimeMinutes, 36);
  assert.equal(summarizeBabyDay({ sleepEntries: [nap], dateKey: date }).sleep.totalMinutes, 36);
  assert.equal(buildBabyActivityLog({ sleepEntries: [nap], dateKey: date })[0].raw.durationMinutes, 36);
  assert.equal(summarizeSleepGuidanceComparison({ sleepEntries: [nap], dateKey: date }).actualMinutes, 36);
});
test('overlapping exact entries and grid estimates count once, without rounding exact boundaries', () => {
  const overlapping = { ...nap, id: 'other', startMinute: 990, endMinute: 1020 };
  assert.equal(buildSleepMinuteSet([], [nap, overlapping], date).size, 53);
  assert.equal(summarizeSleepBlocks([64,65,66], [nap], date).totalMinutes, 45);
  assert.equal(summarizeSleepBlocks([], [{ ...nap, archivedAt: '2026-10-20T00:00:00Z' }], date).totalMinutes, 0);
  assert.equal(nap.notes, 'Journey interrupted sleep.');
});
test('explicit overnight entries split across dates and day/night boundaries, including daylight-saving dates', () => {
  const overnight = { ...nap, sleepDate: '2026-10-24', startMinute: 1427, endMinute: 1483 };
  assert.deepEqual(sleepEntryIntervalForDay(overnight, '2026-10-24'), { start: 1427, end: 1440 });
  assert.deepEqual(sleepEntryIntervalForDay(overnight, '2026-10-25'), { start: 0, end: 43 });
  assert.equal(summarizeSleepBlocks([], [overnight], '2026-10-24').totalMinutes, 13);
  assert.equal(summarizeSleepBlocks([], [overnight], '2026-10-25').nightMinutes, 43);
  assert.equal(summarizeSleepBlocks([], [overnight], '2026-10-26').totalMinutes, 0);
  const boundary = summarizeSleepBlocks([], [{ ...nap, startMinute: 415, endMinute: 425 }], date);
  assert.equal(boundary.nightMinutes, 5); assert.equal(boundary.daytimeMinutes, 5);
});
test('invalid or reversed intervals and excessive notes are rejected before any save', () => {
  for (const change of [{ sleepDate: '2026-02-31' }, { startMinute: -1 }, { startMinute: 1440 }, { startMinute: 1003 }, { endMinute: 967 }, { endMinute: 2408 }, { endMinute: 1003.5 }, { notes: 'x'.repeat(2001) }]) {
    assert.throws(() => validateSleepEntry({ ...nap, ...change }));
  }
  assert.equal(validateSleepEntry({ ...nap, endMinute: 2407 }).endMinute, 2407);
});
