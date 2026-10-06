import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromotionPreview, promotionEligibility, promotionIntent, validatePromotionGraph } from './taskPlanPromotion.js';
const project = '22222222-2222-4222-8222-222222222222';
const manual = { _id: '11111111-1111-4111-8111-111111111111', projectId: project, title: 'Task', status: 'Open' };
const draft = { name: 'Scheduled task', type: 'Task', duration: '2', dependencyChoice: 'independent', start: '2026-10-09' };
test('promotion requires genuine duration and explicit dependency decisions', () => {
  for (const change of [{ duration: '' }, { duration: 0 }, { duration: 1.5 }, { dependencyChoice: '' }, { dependencyChoice: 'dependent', dependencies: [] }, { start: '2026-02-31' }]) assert.throws(() => buildPromotionPreview([], { ...draft, ...change }));
  assert.equal(buildPromotionPreview([], { ...draft, type: 'Milestone', duration: 0 }).finish, '2026-10-09');
});
test('new scheduling uses existing business-day rules without changing the source graph', () => {
  const tasks = [{ id: 1, name: 'Predecessor', start: '2026-10-09', dur: 1, indent: 0 }];
  const before = JSON.stringify(tasks);
  const preview = buildPromotionPreview(tasks, { ...draft, dependencyChoice: 'dependent', dependencies: [{ parentId: 1, depType: 'FS' }] });
  assert.equal(preview.task.start, '2026-10-12'); assert.equal(preview.finish, '2026-10-14'); assert.equal(JSON.stringify(tasks), before);
  assert.equal(preview.task.id, 2);
});
test('dependency validation rejects self/missing/duplicate/cyclic and summary-descendant loops', () => {
  for (const tasks of [
    [{ id: 1, parent: 1 }], [{ id: 1, parent: 2 }],
    [{ id: 1, dependencies: [{ parentId: 2 }, { parentId: 2 }] }, { id: 2 }],
    [{ id: 1, parent: 2 }, { id: 2, parent: 1 }],
    [{ id: 1, indent: 0 }, { id: 2, indent: 1, parent: 3 }, { id: 3, indent: 0, parent: 1 }],
  ]) assert.throws(() => validatePromotionGraph(tasks));
  assert.equal(validatePromotionGraph([{ id: 1 }, { id: 2, parent: 1 }]), true);
  assert.equal(validatePromotionGraph([{ id: 1, indent: 0 }, { id: 2, indent: 1, parent: 1 }]), true);
});
test('promotion does not silently resolve an old missing dependency or reinterpret string task IDs', () => {
  assert.throws(() => buildPromotionPreview([{ id: 1, parent: 2 }], draft), /predecessor is missing/);
  assert.throws(() => buildPromotionPreview([{ id: '1', start: draft.start, dur: 1 }], draft), /numeric task IDs/);
});
test('only stable open one-off sources are eligible and existing links open instead of duplicate', () => {
  assert.equal(promotionEligibility(manual).eligible, true);
  for (const change of [{ status: 'Done' }, { recurrence: { type: 'weekly' } }, { _id: 'offline-todo' }, { sourceBatchId: project }]) assert.equal(promotionEligibility({ ...manual, ...change }).eligible, false);
  const linked = promotionEligibility({ ...manual, meta: { projectPlanLink: { projectId: project, taskId: 4 } } });
  assert.equal(linked.eligible, false); assert.equal(linked.link.taskId, 4);
});
test('promotion intent cannot silently relocate an assigned source to another project', () => {
  const preview = buildPromotionPreview([], draft);
  const reference = promotionEligibility(manual).reference;
  assert.equal(promotionIntent(reference, project, draft, preview).confirmed_finish, preview.finish);
  assert.throws(() => promotionIntent(reference, manual._id, draft, preview));
});
test('promotion cannot silently rewrite an existing unsaved dependency schedule', () => {
  const tasks = [{ id: 1, start: '2026-10-09', dur: 1 }, { id: 2, start: '2026-10-09', dur: 1, parent: 1 }];
  assert.throws(() => buildPromotionPreview(tasks, draft), /scheduling changes saved/);
  assert.equal(tasks[1].start, '2026-10-09');
});
test('group weekend milestones preserve the existing summary predecessor convention', () => {
  const tasks = [{ id: 1, start: '2026-10-09', dur: 0, indent: 0 }, { id: 2, start: '2026-10-09', dur: 0, indent: 1 }, { id: 3, start: '2026-10-11', dur: 0, indent: 1 }];
  const preview = buildPromotionPreview(tasks, { ...draft, duration: 1, dependencyChoice: 'dependent', dependencies: [{ parentId: 1, depType: 'FS' }] });
  assert.equal(preview.task.start, '2026-10-09'); assert.equal(preview.finish, '2026-10-12');
});
