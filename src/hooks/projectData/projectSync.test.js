import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyProjectSyncQueueToState,
  buildProjectSyncOp,
  enqueueProjectSyncOp,
} from './projectSync.js';

test('enqueueProjectSyncOp replaces repeat status/register updates for the same target', () => {
  const queued = enqueueProjectSyncOp([], buildProjectSyncOp({
    kind: 'status-update',
    targetKey: 'status:overallNarrative',
    label: 'Updated Overall narrative',
    payload: { key: 'overallNarrative', value: 'Initial note' },
  }));

  const replaced = enqueueProjectSyncOp(queued, buildProjectSyncOp({
    kind: 'status-update',
    targetKey: 'status:overallNarrative',
    label: 'Updated Overall narrative',
    payload: { key: 'overallNarrative', value: 'Latest note' },
  }));

  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].payload.value, 'Latest note');
});

test('applyProjectSyncQueueToState replays status and register edits onto the latest server state', () => {
  const baseState = {
    registers: {
      actions: [
        { _id: 'a1', description: 'Chase client sign-off', status: 'Open', public: true },
      ],
      issues: [
        { _id: 'i1', description: 'Waiting on test access', status: 'Open' },
      ],
      _raci: [],
    },
    statusReport: {
      overallRag: 'Amber',
      overallNarrative: 'Server version',
      additionalNotes: '',
    },
  };

  const queue = [
    buildProjectSyncOp({
      kind: 'status-update',
      targetKey: 'status:overallNarrative',
      label: 'Updated Overall narrative',
      payload: { key: 'overallNarrative', value: 'Local draft note' },
    }),
    buildProjectSyncOp({
      kind: 'register-update',
      targetKey: 'register:actions:a1',
      label: 'Updated Action Log',
      payload: {
        registerType: 'actions',
        itemId: 'a1',
        patch: { status: 'Completed', completed: '2026-04-05', updatedAt: '2026-04-05T10:00:00.000Z' },
      },
    }),
    buildProjectSyncOp({
      kind: 'register-delete',
      targetKey: 'register:issues:i1:delete',
      label: 'Deleted Issue Log item',
      payload: { registerType: 'issues', itemId: 'i1' },
    }),
    buildProjectSyncOp({
      kind: 'register-add',
      targetKey: 'register:decisions:d1',
      label: 'Added Decision Log item',
      payload: {
        registerType: 'decisions',
        itemData: { _id: 'd1', decision: 'Move pilot to May', status: 'Approved' },
      },
    }),
    buildProjectSyncOp({
      kind: 'register-update',
      targetKey: 'register:_raci:raci_matrix',
      label: 'Updated RACI',
      payload: {
        registerType: '_raci',
        itemId: 'raci_matrix',
        patch: {
          _id: 'raci_matrix',
          assignments: { 'custom-0::Project Manager': 'A' },
          roles: ['Project Manager'],
          updatedAt: '2026-04-05T10:00:00.000Z',
        },
      },
    }),
  ];

  const applied = applyProjectSyncQueueToState(baseState, queue);

  assert.equal(applied.statusReport.overallNarrative, 'Local draft note');
  assert.equal(applied.registers.actions[0].status, 'Completed');
  assert.equal(applied.registers.issues.length, 0);
  assert.equal(applied.registers.decisions[0].decision, 'Move pilot to May');
  assert.equal(applied.registers._raci[0].roles[0], 'Project Manager');
});
