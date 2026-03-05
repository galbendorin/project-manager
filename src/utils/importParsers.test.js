import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBooleanLike,
  parseScheduleSheet,
  parseRegisterSheet,
  parseRaciSheet,
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

test('parseRegisterSheet treats spreadsheet FALSE as external-visible', () => {
  const parsed = parseRegisterSheet(
    [{ ID: '2', Description: 'Client note', Internal: 'FALSE' }],
    REGISTER_IMPORT_COLUMN_MAPS.actions
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].number, '2');
  assert.equal(parsed[0].public, true);
});

test('parseRaciSheet maps activity rows and role assignments', () => {
  const parsed = parseRaciSheet([
    { Activity: 'Project plan', 'Project Manager': 'R/A', Sponsor: 'A' },
    { Activity: 'Steering update', 'Project Manager': 'A', Sponsor: 'I' }
  ]);

  assert.ok(parsed);
  assert.deepEqual(parsed.roles, ['Project Manager', 'Sponsor']);
  assert.deepEqual(parsed.assignments._customTasks, ['Project plan', 'Steering update']);
  assert.equal(parsed.assignments['custom-0::Project Manager'], 'R/A');
  assert.equal(parsed.assignments['custom-0::Sponsor'], 'A');
  assert.equal(parsed.assignments['custom-1::Project Manager'], 'A');
  assert.equal(parsed.assignments['custom-1::Sponsor'], 'I');
});

test('parseRaciSheet returns null when role columns are missing', () => {
  const parsed = parseRaciSheet([{ Activity: 'Only activity column' }]);
  assert.equal(parsed, null);
});

test('findSheet resolves sheet names case-insensitively', () => {
  const selected = findSheet(
    ['Summary', 'risk log', 'Tasks'],
    ['Risks', 'Risk Log', 'Risk Register']
  );
  assert.equal(selected, 'risk log');
});
