import test from "node:test";
import assert from "node:assert/strict";
import {
  groupMatrixTasks,
  matrixPlacement,
  matrixReference,
  validCalendarDay,
  taskViewIdentity,
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
  assert.deepEqual(groupMatrixTasks(tasks, {}, '2026-10-07')[0].cards.map((card) => card.todo._id), ['a', 'z', 'other']);
});
test("date boundary and overdue automation preserve the manual preference", () => {
  const preference = { manual_quadrant: "not_urgent_not_important" };
  assert.equal(
    matrixPlacement(todo, preference, "2026-10-05").quadrant,
    "urgent_important",
  );
  assert.equal(
    matrixPlacement(todo, preference, "2026-10-06").quadrant,
    "urgent_important",
  );
  assert.equal(matrixPlacement(todo, preference, "2026-10-06").automatic, true);
  assert.equal(
    matrixPlacement(
      { ...todo, dueDate: "2026-10-07" },
      preference,
      "2026-10-06",
    ).quadrant,
    "not_urgent_not_important",
  );
  assert.equal(
    matrixPlacement({ ...todo, dueDate: "" }, preference, "2026-10-06")
      .quadrant,
    "not_urgent_not_important",
  );
  assert.equal(
    matrixPlacement(todo, { manual_quadrant: "urgent_important" }, "2026-10-06")
      .automatic,
    false,
  );
});
test("invalid dates, no date and completed tasks never auto promote", () => {
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
  assert.equal(groups[0].cards.length, 1);
  assert.equal(groups[1].cards.length, 1);
});
