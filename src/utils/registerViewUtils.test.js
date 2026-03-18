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
