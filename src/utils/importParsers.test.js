import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBooleanLike,
  parseScheduleSheet,
  parseRegisterSheet,
  findSheet,
  REGISTER_IMPORT_COLUMN_MAPS
} from './importParsers.js';

test('parseBooleanLike handles common spreadsheet values', () => {
  assert.equal(parseBooleanLike(true), true);
  assert.equal(parseBooleanLike(1), true);
  assert.equal(parseBooleanLike('YES'), true);
  assert.equal(parseBooleanLike('x'), true);
  assert.equal(parseBooleanLike('0'), false);
  assert.equal(parseBooleanLike('unchecked'), false);
  assert.equal(parseBooleanLike('random'), false);
});

test('parseScheduleSheet maps and normalizes schedule fields', () => {
  const parsed = parseScheduleSheet([
    {
      ID: '10',
      Name: 'Kickoff',
      Type: 'Milestone',
      Parent: '2',
      'Dependency Type': 'SS',
      Duration: '0',
      Start: '2026-03-01',
      '% Complete': '100',
      'Indent Level': '1',
      tracked: 'yes'
    }
  ]);

  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], {
    id: 10,
    name: 'Kickoff',
    type: 'Milestone',
    parent: 2,
    depType: 'SS',
    dur: 0,
    start: '2026-03-01',
    pct: 100,
    indent: 1,
    tracked: true
  });
});

test('parseRegisterSheet respects Internal visibility mapping', () => {
  const parsed = parseRegisterSheet(
    [{ ID: '1', Description: 'Fix API', Internal: true }],
    REGISTER_IMPORT_COLUMN_MAPS.actions
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].number, '1');
  assert.equal(parsed[0].description, 'Fix API');
  assert.equal(parsed[0].public, false);
  assert.equal(parsed[0].visible, true);
});

test('findSheet resolves sheet names case-insensitively', () => {
  const selected = findSheet(
    ['Summary', 'risk log', 'Tasks'],
    ['Risks', 'Risk Log', 'Risk Register']
  );
  assert.equal(selected, 'risk log');
});
