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
  addLinkedTaskRiskIfMissing,
  addTrackedActionIfMissing,
  getTaskRiskLinkState,
  reconcileActionDeadlineRisks,
  removeLinkedTaskRisk,
  removeTrackedAction,
} from './projectData/registers.js';
import { getTodoCompletionDescriptor } from './projectData/todoCompletion.js';

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

test('createLocalManualTodo keeps explicit blank due date for later bucket quick-add', () => {
  const todo = createLocalManualTodo({
    todoData: { title: 'Later task', dueDate: '' },
    projectId: 'project_1',
    userId: 'user_1',
    ts: '2026-02-24T10:00:00.000Z'
  });

  assert.equal(todo.title, 'Later task');
  assert.equal(todo.dueDate, '');
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

test('linked task risk helpers avoid duplicates and preserve an automatic deadline risk', () => {
  const baseRegisters = { actions: [], risks: [] };
  const task = { id: 5, name: 'Secure deployment approval', owner: 'Delivery', rag: 'amber' };
  const nowIso = '2026-08-02T10:00:00.000Z';

  const withRisk = addLinkedTaskRiskIfMissing(baseRegisters, 5, task, nowIso);
  const stillOne = addLinkedTaskRiskIfMissing(withRisk, 5, task, nowIso);
  assert.equal(stillOne.risks.length, 1);
  assert.deepEqual(getTaskRiskLinkState(stillOne, 5), {
    linked: true,
    manual: true,
    automatic: false,
  });

  const automatic = {
    ...stillOne,
    risks: stillOne.risks.map((risk) => ({ ...risk, deadlineManaged: true })),
  };
  const removedManualLink = removeLinkedTaskRisk(automatic, 5, '2026-08-02T11:00:00.000Z');
  assert.equal(removedManualLink.risks.length, 1);
  assert.deepEqual(getTaskRiskLinkState(removedManualLink, 5), {
    linked: true,
    manual: false,
    automatic: true,
  });
});

test('deadline reconciliation creates one risk for an incomplete action due within three days', () => {
  const registers = {
    actions: [{
      _id: 'action_1',
      description: 'Obtain release approval',
      actionassignedto: 'PM',
      status: 'In Progress',
      target: '2026-08-05',
      public: true,
      visible: true,
    }],
    risks: [],
  };

  const first = reconcileActionDeadlineRisks(registers, {
    todayDate: '2026-08-02',
    nowIso: '2026-08-02T10:00:00.000Z',
  });
  assert.equal(first.registers.risks.length, 1);
  assert.equal(first.registers.risks[0]._id, 'risk_action_action_1');
  assert.equal(first.registers.risks[0].deadlineDaysRemaining, 3);
  assert.equal(first.changes[0].type, 'add');

  const repeated = reconcileActionDeadlineRisks(first.registers, {
    todayDate: '2026-08-02',
    nowIso: '2026-08-02T11:00:00.000Z',
  });
  assert.strictEqual(repeated.registers, first.registers);
  assert.equal(repeated.changes.length, 0);
});

test('deadline reconciliation ignores missing dates, future actions, and completed actions', () => {
  const registers = {
    actions: [
      { _id: 'missing', description: 'Missing date', status: 'Open', target: '' },
      { _id: 'future', description: 'Future date', status: 'Open', target: '2026-08-06' },
      { _id: 'done', description: 'Completed action', status: 'Completed', target: '2026-08-03' },
    ],
    risks: [],
  };

  const result = reconcileActionDeadlineRisks(registers, {
    todayDate: '2026-08-02',
    nowIso: '2026-08-02T10:00:00.000Z',
  });
  assert.strictEqual(result.registers, registers);
  assert.equal(result.changes.length, 0);
});

test('deadline reconciliation removes only generated risks after completion', () => {
  const autoRisk = {
    _id: 'risk_action_action_1',
    riskdetails: 'Deadline risk',
    deadlineManaged: true,
    manualPlanLink: false,
    sourceActionId: 'action_1',
  };
  const manualRisk = { _id: 'manual_risk', riskdetails: 'Supplier capacity', level: 'High' };
  const registers = {
    actions: [{ _id: 'action_1', description: 'Approval', status: 'Completed', target: '2026-08-03' }],
    risks: [autoRisk, manualRisk],
  };

  const result = reconcileActionDeadlineRisks(registers, {
    todayDate: '2026-08-02',
    nowIso: '2026-08-02T10:00:00.000Z',
  });
  assert.deepEqual(result.registers.risks, [manualRisk]);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].type, 'delete');
  assert.equal(result.changes[0].item._id, autoRisk._id);
});

test('tracked actions and manual plan links share one risk row', () => {
  const task = { id: 7, name: 'Production cutover', owner: 'Ops' };
  const withManualRisk = addLinkedTaskRiskIfMissing({ actions: [], risks: [] }, 7, task, '2026-08-02T09:00:00.000Z');
  const registers = {
    ...withManualRisk,
    actions: [{
      _id: 'track_7',
      sourceTaskId: 7,
      description: task.name,
      actionassignedto: 'Ops',
      status: 'In Progress',
      target: '2026-08-03',
    }],
  };

  const result = reconcileActionDeadlineRisks(registers, {
    todayDate: '2026-08-02',
    nowIso: '2026-08-02T10:00:00.000Z',
  });
  assert.equal(result.registers.risks.length, 1);
  assert.equal(result.registers.risks[0]._id, 'risk_task_7');
  assert.equal(result.registers.risks[0].manualPlanLink, true);
  assert.equal(result.registers.risks[0].deadlineManaged, true);
});

test('deadline reconciliation reconnects one unambiguous legacy linked action to its plan task', () => {
  const registers = {
    actions: [{
      _id: 'Lnk',
      number: 'Lnk',
      description: 'Production cutover',
      status: 'In Progress',
      target: '2026-08-03',
    }],
    risks: [],
  };

  const result = reconcileActionDeadlineRisks(registers, {
    todayDate: '2026-08-02',
    nowIso: '2026-08-02T10:00:00.000Z',
    tasks: [
      { id: 7, name: 'Production cutover' },
      { id: 8, name: 'Cutover support' },
    ],
  });

  assert.equal(result.registers.risks.length, 1);
  assert.equal(result.registers.risks[0]._id, 'risk_task_7');
  assert.equal(result.registers.risks[0].sourceTaskId, 7);
  assert.equal(result.registers.risks[0].sourceActionId, 'Lnk');
});

test('deadline reconciliation does not guess between duplicate legacy task names', () => {
  const registers = {
    actions: [{
      _id: 'Lnk',
      number: 'Lnk',
      description: 'Production cutover',
      status: 'In Progress',
      target: '2026-08-03',
    }],
    risks: [],
  };

  const result = reconcileActionDeadlineRisks(registers, {
    todayDate: '2026-08-02',
    nowIso: '2026-08-02T10:00:00.000Z',
    tasks: [
      { id: 7, name: 'Production cutover' },
      { id: 8, name: 'Production cutover' },
    ],
  });

  assert.equal(result.registers.risks.length, 1);
  assert.equal(result.registers.risks[0]._id, 'risk_action_Lnk');
  assert.equal(result.registers.risks[0].sourceTaskId, null);
});

test('deadline reconciliation preserves a manual risk link after the automatic window closes', () => {
  const linkedRisk = {
    _id: 'risk_task_7',
    riskdetails: 'Delivery risk: Production cutover.',
    sourceTaskId: 7,
    sourceActionId: 'track_7',
    manualPlanLink: true,
    deadlineManaged: true,
    deadlineDate: '2026-08-03',
    deadlineDaysRemaining: 1,
  };
  const registers = {
    actions: [{
      _id: 'track_7',
      sourceTaskId: 7,
      description: 'Production cutover',
      status: 'Completed',
      target: '2026-08-03',
    }],
    risks: [linkedRisk],
  };

  const result = reconcileActionDeadlineRisks(registers, {
    todayDate: '2026-08-02',
    nowIso: '2026-08-02T10:00:00.000Z',
  });

  assert.equal(result.registers.risks.length, 1);
  assert.equal(result.registers.risks[0]._id, linkedRisk._id);
  assert.equal(result.registers.risks[0].manualPlanLink, true);
  assert.equal(result.registers.risks[0].deadlineManaged, false);
  assert.equal(result.registers.risks[0].sourceActionId, null);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].type, 'update');
});

test('getTodoCompletionDescriptor maps each Tasks source to the right underlying update', () => {
  const currentDate = '2026-03-19';
  const nowIso = '2026-03-19T10:00:00.000Z';

  assert.deepEqual(
    getTodoCompletionDescriptor({ _id: 'todo_1', isDerived: false }, currentDate, nowIso),
    { kind: 'manual', todoId: 'todo_1', key: 'status', value: 'Done' }
  );

  assert.deepEqual(
    getTodoCompletionDescriptor({
      _id: 'action_a1',
      isDerived: true,
      originType: 'register',
      originRegisterType: 'actions',
      originItemId: 'a1'
    }, currentDate, nowIso),
    {
      kind: 'register',
      registerType: 'actions',
      itemId: 'a1',
      patch: { status: 'Completed', completed: currentDate, update: currentDate }
    }
  );

  assert.deepEqual(
    getTodoCompletionDescriptor({
      _id: 'issue_i1',
      isDerived: true,
      originType: 'register',
      originRegisterType: 'issues',
      originItemId: 'i1'
    }, currentDate, nowIso),
    {
      kind: 'register',
      registerType: 'issues',
      itemId: 'i1',
      patch: { status: 'Resolved', completed: currentDate, update: currentDate }
    }
  );

  assert.deepEqual(
    getTodoCompletionDescriptor({
      _id: 'change_c1',
      isDerived: true,
      originType: 'register',
      originRegisterType: 'changes',
      originItemId: 'c1'
    }, currentDate, nowIso),
    {
      kind: 'register',
      registerType: 'changes',
      itemId: 'c1',
      patch: { status: 'Implemented', complete: currentDate, updated: currentDate }
    }
  );

  assert.deepEqual(
    getTodoCompletionDescriptor({
      _id: 'tracker_t1',
      isDerived: true,
      originType: 'tracker',
      originItemId: 't1'
    }, currentDate, nowIso),
    {
      kind: 'tracker',
      trackerId: 't1',
      patch: { status: 'Completed', lastUpdated: currentDate, updatedAt: nowIso }
    }
  );

  assert.deepEqual(
    getTodoCompletionDescriptor({
      _id: 'schedule_5',
      isDerived: true,
      originType: 'schedule',
      originTaskId: 5
    }, currentDate, nowIso),
    {
      kind: 'schedule',
      taskId: 5,
      patch: { pct: 100 }
    }
  );
});
