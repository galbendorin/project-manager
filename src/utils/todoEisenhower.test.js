import test from "node:test";
import assert from "node:assert/strict";
import {
  groupMatrixTasks,
  matrixPlacement,
  matrixReference,
  validCalendarDay,
  taskViewIdentity,
  deadlineDescription,
} from "./todoEisenhower.js";
import { shouldClearUserOfflineKey } from "./offlineState.js";
const id = "11111111-1111-4111-8111-111111111111";
const project = "22222222-2222-4222-8222-222222222222";
const todo = { _id: id, title: "Task", status: "Open", dueDate: "2026-10-05" };
test('each Matrix quadrant groups projects A–Z before deadline order', () => {
  const tasks = [
    { ...todo, _id: 'z', projectId: 'z', projectName: 'Zebra', dueDate: '2026-10-01' },
    { ...todo, _id: 'a', projectId: 'a', projectName: 'Alpha', dueDate: '2026-10-05' },
    { ...todo, _id: 'other', projectName: 'Other', dueDate: '2026-10-01' },
  ];
  assert.deepEqual(groupMatrixTasks(tasks, {}, '2026-10-07')[1].cards.map((card) => card.todo._id), ['a', 'z', 'other']);
});
test("Q2 is the default and only personal choices place tasks in Q1, independent of deadlines", () => {
  for (const dueDate of ['', '2026-10-04', '2026-10-05', '2026-10-07']) {
    const task = { ...todo, dueDate };
    for (const today of ['2026-10-05', '2026-10-06']) {
      assert.equal(matrixPlacement(task, null, today).quadrant, 'not_urgent_important');
      assert.equal(matrixPlacement(task, { manual_quadrant: 'invalid' }, today).quadrant, 'not_urgent_important');
      for (const quadrant of ['urgent_important', 'not_urgent_important', 'urgent_not_important', 'not_urgent_not_important']) {
        assert.equal(matrixPlacement(task, { manual_quadrant: quadrant, manual_quadrant_day: '2026-10-04' }, today).quadrant, quadrant);
      }
    }
  }
  assert.equal(matrixPlacement(todo, null, '2026-10-05').dueToday, true);
  assert.equal(matrixPlacement(todo, null, '2026-10-06').overdue, true);
  assert.match(deadlineDescription(todo, '2026-10-06'), /Overdue.*5 Oct 2026.*1 day late/);
});
test("invalid dates, no date and completed tasks are not marked overdue", () => {
  assert.equal(validCalendarDay("2026-02-31"), false);
  assert.equal(validCalendarDay("2024-02-29"), true);
  for (const dueDate of ["", "not-a-date", "2026-02-31"])
    assert.equal(
      matrixPlacement({ ...todo, dueDate }, null, "2026-10-05").overdue,
      false,
    );
  assert.equal(
    matrixPlacement({ ...todo, status: "Done" }, null, "2026-10-06").overdue,
    false,
  );
});
test("manual identity survives project move and derived identity includes project", () => {
  assert.deepEqual(
    matrixReference({ ...todo, projectId: project }),
    matrixReference({ ...todo, projectId: null }),
  );
  const derived = {
    ...todo,
    isDerived: true,
    projectId: project,
    originType: "register",
    originRegisterType: "actions",
    originItemId: "same",
    hasStableOriginId: true,
  };
  assert.notEqual(
    matrixReference(derived).task_key,
    matrixReference({ ...derived, projectId: id }).task_key,
  );
  assert.equal(matrixReference({ ...derived, hasStableOriginId: false }), null);
  assert.equal(matrixReference({ _id: "todo-local" }), null);
  assert.equal(
    taskViewIdentity({ ...todo, projectId: project }),
    taskViewIdentity({ ...todo, projectId: null }),
  );
  assert.notEqual(
    taskViewIdentity(derived),
    taskViewIdentity({ ...derived, projectId: id }),
  );
});
test("matrix focus memory cleanup belongs only to the leaving account", () => {
  assert.equal(
    shouldClearUserOfflineKey(`pmworkspace:todo-matrix-focus:v1:${id}`, id),
    true,
  );
  assert.equal(
    shouldClearUserOfflineKey(
      `pmworkspace:todo-matrix-focus:v1:${project}`,
      id,
    ),
    false,
  );
});
test("four quadrants hold each open task once, excluding completed tasks and separating recurrent identities", () => {
  const groups = groupMatrixTasks(
    [
      todo,
      { ...todo, _id: project, status: "Done" },
      { ...todo, _id: project, dueDate: "" },
    ],
    {},
    "2026-10-06",
  );
  assert.equal(groups.length, 4);
  assert.equal(groups.flatMap((q) => q.cards).length, 2);
  assert.equal(groups[0].cards.length, 0);
  assert.equal(groups[1].cards.length, 2);
});
