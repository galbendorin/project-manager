import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toggleMultiFilterValue,
  matchesProjectSelection,
  matchesSourceSelection,
  matchesOwnerSelection,
  matchesRecurrenceSelection,
  matchesBucketSelection,
  getMultiFilterSummary,
} from './todoFilterUtils.js';

test('toggleMultiFilterValue adds and removes values', () => {
  assert.deepEqual(toggleMultiFilterValue([], 'demo'), ['demo']);
  assert.deepEqual(toggleMultiFilterValue(['demo'], 'demo'), []);
  assert.deepEqual(toggleMultiFilterValue(['demo'], 'personal'), ['demo', 'personal']);
});

test('matchesProjectSelection supports specific projects and other bucket', () => {
  const itemWithProject = { projectId: 'demo' };
  const itemWithoutProject = { projectId: null };

  assert.equal(matchesProjectSelection([], itemWithProject), true);
  assert.equal(matchesProjectSelection(['demo'], itemWithProject), true);
  assert.equal(matchesProjectSelection(['personal'], itemWithProject), false);
  assert.equal(matchesProjectSelection(['other'], itemWithoutProject), true);
});

test('matchesSourceSelection supports manual, derived, and specific sources', () => {
  const manual = { isDerived: false, source: 'Manual' };
  const action = { isDerived: true, source: 'Action Log' };
  const sourceKey = (item) => item.source === 'Action Log' ? 'action' : 'manual';

  assert.equal(matchesSourceSelection([], manual, sourceKey), true);
  assert.equal(matchesSourceSelection(['manual'], manual, sourceKey), true);
  assert.equal(matchesSourceSelection(['derived'], manual, sourceKey), false);
  assert.equal(matchesSourceSelection(['action'], action, sourceKey), true);
});

test('matchesOwnerSelection supports multi-select owners', () => {
  assert.equal(matchesOwnerSelection([], { owner: 'Dorin' }), true);
  assert.equal(matchesOwnerSelection(['Dorin', 'Alison'], { owner: 'Dorin' }), true);
  assert.equal(matchesOwnerSelection(['Alison'], { owner: 'Dorin' }), false);
});

test('matchesRecurrenceSelection keeps manual and one-time logic intact', () => {
  const manualNone = { isDerived: false, recurrence: null };
  const manualWeekly = { isDerived: false, recurrence: { type: 'weekly' } };
  const derived = { isDerived: true, recurrence: { type: 'weekly' } };

  assert.equal(matchesRecurrenceSelection([], manualWeekly), true);
  assert.equal(matchesRecurrenceSelection(['none'], manualNone), true);
  assert.equal(matchesRecurrenceSelection(['none'], manualWeekly), false);
  assert.equal(matchesRecurrenceSelection(['weekly'], manualWeekly), true);
  assert.equal(matchesRecurrenceSelection(['weekly'], derived), false);
});

test('matchesBucketSelection supports multi-select bucket filtering', () => {
  assert.equal(matchesBucketSelection([], 'today'), true);
  assert.equal(matchesBucketSelection(['today', 'thisWeek'], 'today'), true);
  assert.equal(matchesBucketSelection(['thisWeek'], 'today'), false);
});

test('getMultiFilterSummary returns useful button labels', () => {
  const options = [
    { value: 'demo', label: 'Demo' },
    { value: 'personal', label: 'Personal' },
    { value: 'other', label: 'Other' },
  ];

  assert.equal(getMultiFilterSummary([], options, 'All Projects'), 'All Projects');
  assert.equal(getMultiFilterSummary(['demo'], options, 'All Projects'), 'Demo');
  assert.equal(getMultiFilterSummary(['demo', 'personal'], options, 'All Projects'), 'Demo + Personal');
  assert.equal(getMultiFilterSummary(['demo', 'personal', 'other'], options, 'All Projects'), '3 selected');
});
