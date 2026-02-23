import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalManualTodo,
  buildLocalTodoUpdate,
  applyTodoUpdateToState,
  buildTodoUpdatePatch,
  buildRecurringFollowUpInsert
} from './projectData/todos.js';
import {
  normalizeLoadedProjectState,
  buildProjectUpdatePayload
} from './projectData/loadSave.js';
import {
  addTrackedActionIfMissing,
  removeTrackedAction
} from './projectData/registers.js';

test('createLocalManualTodo applies defaults and project linkage', () => {
  const todo = createLocalManualTodo({
    todoData: {},
    projectId: 'project_1',
    userId: 'user_1',
    ts: '2026-02-24T10:00:00.000Z'
  });

  assert.equal(todo.projectId, 'project_1');
  assert.equal(todo.status, 'Open');
  assert.equal(todo.owner, 'PM');
  assert.equal(todo.assigneeUserId, 'user_1');
  assert.equal(todo.recurrence, null);
  assert.match(todo.dueDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('buildLocalTodoUpdate creates recurring follow-up when marking done', () => {
  const todo = {
    _id: 'todo_1',
    projectId: 'project_1',
    title: 'Weekly report',
    dueDate: '2026-02-03',
    owner: 'PM',
    assigneeUserId: 'user_1',
    status: 'Open',
    recurrence: { type: 'weekly', interval: 1 },
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    completedAt: ''
  };

  const updated = buildLocalTodoUpdate({
    todo,
    key: 'status',
    value: 'Done',
    userId: 'user_1',
    ts: '2026-02-03T12:00:00.000Z'
  });

  assert.equal(updated.localUpdated.status, 'Done');
  assert.equal(updated.localUpdated.completedAt, '2026-02-03T12:00:00.000Z');
  assert.equal(updated.transitionedToDone, true);
  assert.equal(updated.nextRecurringDueDate, '2026-02-10');
  assert.ok(updated.followUpLocal);
  assert.equal(updated.followUpLocal.status, 'Open');
  assert.equal(updated.followUpLocal.projectId, 'project_1');
  assert.deepEqual(updated.followUpLocal.recurrence, { type: 'weekly', interval: 1 });
});

test('applyTodoUpdateToState updates by id and appends follow-up item', () => {
  const prev = [
    { _id: 'todo_1', status: 'Open', owner: 'PM' },
    { _id: 'todo_2', status: 'Open', owner: 'QA' }
  ];
  const localUpdated = { _id: 'todo_1', status: 'Done', owner: 'PM' };
  const followUp = { _id: 'todo_3', status: 'Open', owner: 'PM' };

  const next = applyTodoUpdateToState(prev, 'todo_1', localUpdated, followUp);
  assert.equal(next.length, 3);
  assert.equal(next[0].status, 'Done');
  assert.equal(next[1]._id, 'todo_2');
  assert.equal(next[2]._id, 'todo_3');
});

test('buildTodoUpdatePatch supports project reassignment and done status', () => {
  const patchProject = buildTodoUpdatePatch({
    todo: { completedAt: '' },
    key: 'projectId',
    value: null,
    normalizedRecurrence: null,
    nextStatus: 'Open',
    ts: '2026-02-24T10:00:00.000Z'
  });
  assert.equal(patchProject.project_id, null);

  const patchDone = buildTodoUpdatePatch({
    todo: { completedAt: '' },
    key: 'status',
    value: 'Done',
    normalizedRecurrence: null,
    nextStatus: 'Done',
    ts: '2026-02-24T10:00:00.000Z'
  });
  assert.equal(patchDone.status, 'Done');
  assert.equal(patchDone.completed_at, '2026-02-24T10:00:00.000Z');
});

test('buildRecurringFollowUpInsert keeps user/project ownership fields', () => {
  const insert = buildRecurringFollowUpInsert({
    userId: 'user_1',
    localUpdated: {
      projectId: null,
      title: 'Billing check',
      owner: 'Ops',
      assigneeUserId: 'user_2'
    },
    normalizedRecurrence: { type: 'monthly', interval: 1 },
    nextRecurringDueDate: '2026-03-01'
  });

  assert.equal(insert.user_id, 'user_1');
  assert.equal(insert.project_id, null);
  assert.equal(insert.assignee_user_id, 'user_2');
  assert.equal(insert.status, 'Open');
  assert.deepEqual(insert.recurrence, { type: 'monthly', interval: 1 });
});

test('normalizeLoadedProjectState backfills missing structures and timestamps', () => {
  const nowIso = '2026-02-24T10:00:00.000Z';
  const normalized = normalizeLoadedProjectState({
    tasks: [{ id: 1, name: 'Task A' }],
    registers: { actions: [{ _id: 'a1', description: 'Tracked', dateAdded: '2026-02-01' }] },
    tracker: [{ _id: 't1', taskId: 1, lastUpdated: '2026-02-02' }],
    baseline: null,
    status_report: null
  }, () => nowIso);

  assert.equal(normalized.tasks.length, 1);
  assert.equal(normalized.tasks[0].createdAt, nowIso);
  assert.equal(normalized.registers.actions[0].createdAt, '2026-02-01');
  assert.equal(normalized.registers.actions[0].updatedAt, nowIso);
  assert.ok(Array.isArray(normalized.registers.risks));
  assert.equal(normalized.tracker[0].updatedAt, '2026-02-02');
  assert.equal(normalized.version, 1);
});

test('buildProjectUpdatePayload includes baseline only when defined', () => {
  const payloadWithoutBaseline = buildProjectUpdatePayload({
    projectData: [],
    registers: { risks: [] },
    tracker: [],
    statusReport: { overallRag: 'Green' },
    baseline: undefined
  });
  assert.equal(Object.prototype.hasOwnProperty.call(payloadWithoutBaseline, 'baseline'), false);

  const payloadWithBaseline = buildProjectUpdatePayload({
    projectData: [],
    registers: { risks: [] },
    tracker: [],
    statusReport: { overallRag: 'Green' },
    baseline: null
  });
  assert.equal(Object.prototype.hasOwnProperty.call(payloadWithBaseline, 'baseline'), true);
  assert.equal(payloadWithBaseline.baseline, null);
});

test('tracked action helpers are idempotent and removable', () => {
  const baseRegisters = { actions: [] };
  const task = { id: 5, name: 'Task 5', pct: 20, start: '2026-02-24', dur: 2 };

  const withAction = addTrackedActionIfMissing(baseRegisters, 5, task, '2026-02-24T10:00:00.000Z');
  assert.equal(withAction.actions.length, 1);
  assert.equal(withAction.actions[0]._id, 'track_5');

  const stillOne = addTrackedActionIfMissing(withAction, 5, task, '2026-02-24T11:00:00.000Z');
  assert.equal(stillOne.actions.length, 1);

  const removed = removeTrackedAction(stillOne, 5);
  assert.equal(removed.actions.length, 0);
});
