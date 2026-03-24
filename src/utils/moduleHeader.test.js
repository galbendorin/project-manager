import test from 'node:test';
import assert from 'node:assert/strict';
import { getModuleHeaderCountText, getModuleHeaderLabel } from './moduleHeader.js';

test('module header label mapping stays aligned with the main registers', () => {
  assert.equal(getModuleHeaderLabel('schedule'), 'Tasks');
  assert.equal(getModuleHeaderLabel('timesheets'), 'Entries');
  assert.equal(getModuleHeaderLabel('risks'), 'Risks');
  assert.equal(getModuleHeaderLabel('issues'), 'Issues');
  assert.equal(getModuleHeaderLabel('actions'), 'Actions');
  assert.equal(getModuleHeaderLabel('minutes'), 'Meetings');
  assert.equal(getModuleHeaderLabel('unknown'), '');
});

test('module header count text renders only for supported module types', () => {
  assert.equal(getModuleHeaderCountText('schedule', 35), 'Tasks: 35');
  assert.equal(getModuleHeaderCountText('timesheets', 12), 'Entries: 12');
  assert.equal(getModuleHeaderCountText('risks', 8), 'Risks: 8');
  assert.equal(getModuleHeaderCountText('issues', 5), 'Issues: 5');
  assert.equal(getModuleHeaderCountText('actions', 13), 'Actions: 13');
  assert.equal(getModuleHeaderCountText('minutes', 4), 'Meetings: 4');
  assert.equal(getModuleHeaderCountText('statusreport', 1), '');
  assert.equal(getModuleHeaderCountText('schedule', null), '');
});
