import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMAS } from './constants.js';
import { applyRegisterView, getRegisterViewConfig } from './registerViewUtils.js';

test('getRegisterViewConfig exposes Action Log filters and defaults', () => {
  const items = [
    {
      _id: 'a1',
      number: 'A1',
      category: 'Logistics',
      actionassignedto: 'Dorin',
      status: 'Open',
      currentstatus: 'In Progress',
      target: '2026-03-20',
      public: true
    }
  ];

  const config = getRegisterViewConfig(SCHEMAS.actions, items, false);

  assert.equal(config.statusColumn, 'Status');
  assert.equal(config.ownerColumn, 'Action Assigned to');
  assert.equal(config.categoryColumn, 'Category');
  assert.equal(config.dateColumn, 'Target');
  assert.equal(config.defaultSort, 'dateAsc');
  assert.deepEqual(config.statusOptions, ['Open']);
  assert.deepEqual(config.ownerOptions, ['Dorin']);
  assert.deepEqual(config.categoryOptions, ['Logistics']);
});

test('applyRegisterView filters and sorts Action Log items by selected controls', () => {
  const items = [
    {
      _id: 'a1',
      number: 'A1',
      category: 'Planning',
      actionassignedto: 'Dorin',
      description: 'Build itinerary',
      status: 'Open',
      target: '2026-03-24',
      public: true
    },
    {
      _id: 'a2',
      number: 'A2',
      category: 'Shopping',
      actionassignedto: 'Alison',
      description: 'Buy supplies',
      status: 'Completed',
      target: '2026-03-18',
      public: true
    },
    {
      _id: 'a3',
      number: 'A3',
      category: 'Shopping',
      actionassignedto: 'Dorin',
      description: 'Pick up fresh food',
      status: 'Open',
      target: '2026-03-20',
      public: false
    }
  ];

  const config = getRegisterViewConfig(SCHEMAS.actions, items, true);
  const visibleOpenShopping = applyRegisterView({
    items,
    searchQuery: '',
    isExternalView: true,
    statusFilter: 'Open',
    ownerFilter: 'all',
    categoryFilter: 'Shopping',
    sortKey: 'dateAsc',
    config
  });

  assert.equal(visibleOpenShopping.length, 0);

  const dorinItems = applyRegisterView({
    items,
    searchQuery: '',
    isExternalView: false,
    statusFilter: 'all',
    ownerFilter: 'Dorin',
    categoryFilter: 'all',
    sortKey: 'dateAsc',
    config: getRegisterViewConfig(SCHEMAS.actions, items, false)
  });

  assert.deepEqual(dorinItems.map((item) => item.number), ['A3', 'A1']);
});

test('getRegisterViewConfig exposes extra filters for Issue Log and Lessons Learned', () => {
  const issueItems = [
    {
      _id: 'i1',
      number: 'I1',
      issueassignedto: 'Dorin',
      status: 'Open',
      raised: '2026-03-10',
      update: '2026-03-12',
      completed: '2026-03-15'
    }
  ];
  const issueConfig = getRegisterViewConfig(SCHEMAS.issues, issueItems, false);

  assert.deepEqual(issueConfig.filterColumns, ['Status', 'Issue Assigned to', 'Raised', 'Update', 'Completed']);
  assert.deepEqual(issueConfig.filterOptionsByColumn.Raised, ['2026-03-10']);
  assert.deepEqual(issueConfig.filterOptionsByColumn.Update, ['2026-03-12']);
  assert.deepEqual(issueConfig.filterOptionsByColumn.Completed, ['2026-03-15']);

  const lessonItems = [
    {
      _id: 'l1',
      number: 'L1',
      phase: 'Execution',
      category: 'Governance',
      owner: 'PM',
      status: 'Open'
    }
  ];
  const lessonConfig = getRegisterViewConfig(SCHEMAS.lessons, lessonItems, false);

  assert.deepEqual(lessonConfig.filterColumns, ['Status', 'Owner', 'Category', 'Phase']);
  assert.deepEqual(lessonConfig.filterOptionsByColumn.Phase, ['Execution']);
  assert.deepEqual(lessonConfig.filterOptionsByColumn.Category, ['Governance']);
});

test('applyRegisterView sorts Risk Log items by level severity', () => {
  const items = [
    { _id: 'r1', number: 'R1', category: 'Tech', level: 'Medium', public: true },
    { _id: 'r2', number: 'R2', category: 'Tech', level: 'High', public: true },
    { _id: 'r3', number: 'R3', category: 'Tech', level: 'Low', public: true }
  ];

  const config = getRegisterViewConfig(SCHEMAS.risks, items, false);
  const highToLow = applyRegisterView({
    items,
    sortKey: 'levelDesc',
    config
  });

  assert.deepEqual(highToLow.map((item) => item.number), ['R2', 'R1', 'R3']);
});

test('applyRegisterView supports column-specific filters for Action Log dates', () => {
  const items = [
    {
      _id: 'a1',
      number: 'A1',
      actionassignedto: 'Dorin',
      status: 'Open',
      raised: '2026-03-10',
      update: '2026-03-18',
      completed: ''
    },
    {
      _id: 'a2',
      number: 'A2',
      actionassignedto: 'Dorin',
      status: 'Completed',
      raised: '2026-03-11',
      update: '2026-03-18',
      completed: '2026-03-19'
    }
  ];

  const config = getRegisterViewConfig(SCHEMAS.actions, items, false);
  const filtered = applyRegisterView({
    items,
    columnFilters: {
      Raised: '2026-03-11',
      Completed: '2026-03-19'
    },
    config
  });

  assert.deepEqual(filtered.map((item) => item.number), ['A2']);
});
