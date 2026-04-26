import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBabyActivityLog,
  summarizeBabyDay,
  summarizeSleepBlocks,
} from './babyTracker.js';

test('summarizeSleepBlocks totals day, night, and sessions from 15-minute blocks', () => {
  const summary = summarizeSleepBlocks([
    { blockIndex: 0, status: 'asleep' },
    { blockIndex: 1, status: 'asleep' },
    { blockIndex: 28, status: 'asleep' },
    { blockIndex: 29, status: 'asleep' },
    { blockIndex: 30, status: 'asleep' },
    { blockIndex: 76, status: 'awake' },
    { blockIndex: 77, status: 'asleep' },
  ]);

  assert.equal(summary.totalMinutes, 90);
  assert.equal(summary.totalHours, 1.5);
  assert.equal(summary.daytimeMinutes, 45);
  assert.equal(summary.nightMinutes, 45);
  assert.equal(summary.sessionCount, 3);
  assert.deepEqual(summary.sessions.map((session) => session.startTime), ['00:00', '07:00', '19:15']);
});

test('summarizeBabyDay aggregates feeds and nappies', () => {
  const summary = summarizeBabyDay({
    feeds: [
      { durationMinutes: 18 },
      { durationMinutes: 22 },
    ],
    nappies: [
      { nappyType: 'wet' },
      { nappyType: 'poo' },
      { nappyType: 'mixed' },
    ],
    sleepBlocks: [
      { blockIndex: 40, status: 'asleep' },
      { blockIndex: 41, status: 'asleep' },
    ],
  });

  assert.equal(summary.feedCount, 2);
  assert.equal(summary.totalFeedMinutes, 40);
  assert.equal(summary.averageFeedMinutes, 20);
  assert.equal(summary.wetNappies, 2);
  assert.equal(summary.pooNappies, 2);
  assert.equal(summary.totalNappies, 3);
  assert.equal(summary.sleep.totalMinutes, 30);
});

test('buildBabyActivityLog merges care events chronologically', () => {
  const events = buildBabyActivityLog({
    feeds: [
      { id: 'feed_2', occurredAt: '2026-04-26T09:30:00', durationMinutes: 20 },
      { id: 'feed_1', occurredAt: '2026-04-26T07:00:00', durationMinutes: 15 },
    ],
    nappies: [
      { id: 'nappy_1', occurredAt: '2026-04-26T08:00:00', nappyType: 'wet' },
    ],
  });

  assert.deepEqual(events.map((event) => event.id), ['feed:feed_1', 'nappy:nappy_1', 'feed:feed_2']);
});

test('buildBabyActivityLog includes breastfeeding side details', () => {
  const events = buildBabyActivityLog({
    feeds: [
      {
        id: 'feed_left',
        occurredAt: '2026-04-26T07:00:00',
        durationMinutes: 10,
        feedType: 'breastfeeding',
        breastSide: 'left',
      },
    ],
  });

  assert.equal(events[0].label, 'Breastfeed');
  assert.equal(events[0].detail, '10 min · left');
});
