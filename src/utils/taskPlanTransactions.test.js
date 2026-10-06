import test from 'node:test';
import assert from 'node:assert/strict';
import { readPromotionSnapshot, linkedTaskFromPromotionSnapshot, validatePromotionAck, writePromotionTransaction, projectLinkedSource, planTaskVisibleExternally } from '../hooks/projectData/taskPlanTransactions.js';
import { collectDerivedTodos } from './helpers.js';
import { getTodoCompletionDescriptor } from '../hooks/projectData/todoCompletion.js';
const projectId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const reference = { kind: 'manual', id, projectId, key: `manual:${id}` };
const link = { projectId, sourceKind: 'manual', sourceId: id, sourceKey: reference.key, taskId: 1, operationId };
const task = { id: 1, name: 'Current plan title', start: '2026-10-09', dur: 2, pct: 50, tracked: true, originRef: link };
const source = { id, project_id: projectId, title: 'Captured title', meta: { retained: 'note', projectPlanLink: link } };
const project = { id: projectId, version: 2, tasks: [task] };
const ack = { ok: true, operation_id: operationId, project_id: projectId, task_id: 1, project, source };
test('promotion accepts only a reciprocal acknowledged source/project/task/operation', () => {
  assert.equal(validatePromotionAck(ack, { projectId, reference, operationId }), ack);
  for (const changed of [null, { ...ack, operation_id: 'other' }, { ...ack, project: { ...project, version: null } }, { ...ack, source: { ...source, project_id: null } }, { ...ack, project: { ...project, tasks: [{ ...task, originRef: { ...link, sourceId: 'different' } }] } }]) assert.throws(() => validatePromotionAck(changed, { projectId, reference, operationId }));
});
test('a missing or failing RPC never falls back to separate plan/source writes', async () => {
  const calls = [];
  const client = { rpc: async (name, payload) => { calls.push({ name, payload }); return { data: null, error: { message: 'Missing function' } }; }, from() { throw new Error('Unexpected table mutation'); } };
  const snapshot = { projectId, project, source };
  await assert.rejects(writePromotionTransaction(client, { snapshot, reference, operationId, intent: { duration: 2 } }), /Missing function/);
  assert.equal(calls.length, 1); assert.equal(calls[0].payload.p_expected_source, source); assert.equal(calls[0].payload.p_operation_id, operationId);
});
test('promotion preparation reads the raw source and rejects ambiguous stable IDs', async () => {
  const client = { from(table) { return { select() { return this; }, eq() { return this; }, async single() { return { data: table === 'projects' ? project : source }; } }; } };
  assert.equal((await readPromotionSnapshot(client, projectId, reference)).source, source);
  const duplicate = { ...project, registers: { actions: [{ _id: 'action' }, { _id: 'action' }] } };
  const actionClient = { from() { return { select() { return this; }, eq() { return this; }, async single() { return { data: duplicate }; } }; } };
  await assert.rejects(readPromotionSnapshot(actionClient, projectId, { kind: 'action', id: 'action' }), /ambiguous/);
});
test('linked manual projection preserves source identity/notes but follows the plan schedule', () => {
  const original = { _id: id, projectId, description: 'Retained description', owner: 'Original owner', title: 'Captured title', dueDate: '2026-10-02', status: 'Open', meta: source.meta };
  const projected = projectLinkedSource(original, 'manual', [task]);
  assert.equal(projected._id, id); assert.equal(projected.description, original.description); assert.equal(projected.owner, original.owner);
  assert.equal(projected.title, task.name); assert.equal(projected.dueDate, '2026-10-13'); assert.equal(projected.planProgress, 50);
  assert.equal(getTodoCompletionDescriptor(projected, '2026-10-06', '').kind, 'schedule');
  const missing = projectLinkedSource(original, 'manual', []);
  assert.equal(missing.title, original.title); assert.equal(missing.planLinkUnavailable, true); assert.equal(getTodoCompletionDescriptor(missing, '', ''), null);
});
test('arbitrary promoted actions and trackers emit one original card and no duplicate plan card', () => {
  for (const kind of ['action', 'tracker']) {
    const origin = { ...link, sourceKind: kind, sourceId: 'arbitrary-id', sourceKey: `project:${projectId}:${kind}` };
    const row = { _id: 'arbitrary-id', projectPlanLink: origin, description: 'Old action', taskName: 'Old tracker', sourceTaskId: 1, taskId: 1, target: '2026-10-02', status: 'Open', notes: 'Keep' };
    const tasks = [{ ...task, originRef: origin, pct: 100 }];
    const todos = collectDerivedTodos(tasks, kind === 'action' ? { actions: [row] } : {}, kind === 'tracker' ? [row] : []);
    assert.equal(todos.length, 1); assert.equal(todos[0].originItemId, row._id); assert.equal(todos[0].title, task.name); assert.equal(todos[0].dueDate, '2026-10-13'); assert.equal(todos[0].status, 'Done');
    assert.equal(getTodoCompletionDescriptor(todos[0], '', '').taskId, 1);
  }
  assert.equal(collectDerivedTodos([], {}, [{ _id: 'returned', taskName: 'Returned work', dueDate: '2026-10-14' }])[0].dueDate, '2026-10-14');
});
test('return acknowledgement requires a retired link receipt and absence of the plan row', () => {
  const returned = { ...ack, project: { ...project, version: 3, tasks: [] }, source: { ...source, meta: { projectPlanLastReturn: { operationId, link } } } };
  assert.equal(validatePromotionAck(returned, { projectId, reference, operationId, returning: true }), returned);
  assert.throws(() => validatePromotionAck({ ...returned, project }, { projectId, reference, operationId, returning: true }));
  assert.doesNotThrow(() => validatePromotionAck({ ...returned, project: { ...returned.project, tasks: [{ id: 1, name: 'Unrelated later task' }] } }, { projectId, reference, operationId, returning: true }));
});
test('an existing manual link cannot resolve from a stale project snapshot during the two-read race', async () => {
  const snapshot = { projectId, project, source, reference };
  assert.equal(linkedTaskFromPromotionSnapshot(snapshot), task);
  assert.throws(() => linkedTaskFromPromotionSnapshot({ ...snapshot, project: { ...project, tasks: [] } }), /changed while loading/);
  assert.throws(() => linkedTaskFromPromotionSnapshot({ ...snapshot, source: { ...source, meta: {} } }), /changed while loading/);
  const client = { from(table) { return { select() { return this; }, eq() { return this; }, async single() { return { data: table === 'projects' ? { ...project, tasks: [] } : source }; } }; } };
  await assert.rejects(readPromotionSnapshot(client, projectId, reference), /changed while loading/);
});
test('external plan visibility retains private flags and follows a linked source becoming private', () => {
  const linked = { ...task, public: true, originRef: { ...link, sourceKind: 'action', sourceId: 'action' } };
  assert.equal(planTaskVisibleExternally(linked, { actions: [{ _id: 'action', public: true }] }, []), true);
  assert.equal(planTaskVisibleExternally(linked, { actions: [{ _id: 'action', public: false }] }, []), false);
  assert.equal(planTaskVisibleExternally(linked, {}, []), false);
  assert.equal(planTaskVisibleExternally({ ...linked, public: false }, { actions: [{ _id: 'action', public: true }] }, []), false);
});
test('confirmed rollback and uncertain transport failures are distinct for retry identity', async () => {
  const snapshot = { projectId, project, source };
  const operation = { snapshot, reference, operationId, intent: {} };
  await assert.rejects(writePromotionTransaction({ rpc: async () => ({ error: { code: '40001', message: 'PLAN_PROMOTION_CONFLICT' } }) }, operation), (error) => error.transactionRejected === true);
  await assert.rejects(writePromotionTransaction({ rpc: async () => ({ error: { message: 'Network response unavailable' } }) }, operation), (error) => error.transactionRejected === false);
  for (const code of ['08007', '08006', '40003']) await assert.rejects(writePromotionTransaction({ rpc: async () => ({ error: { code, message: 'Transaction outcome unavailable' } }) }, operation), (error) => error.transactionRejected === false);
});
test('a forwarding alias from an older client does not duplicate promoted work in Today', () => {
  assert.equal(collectDerivedTodos([task], {}, [{ _id: 'old-alias', taskId: task.id, taskName: 'Old alias' }]).length, 0);
});
