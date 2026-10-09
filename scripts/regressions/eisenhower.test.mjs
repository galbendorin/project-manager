import assert from "node:assert/strict";
import test from "node:test";
import {
  React,
  create,
  act,
  mountHook,
  mockTransport,
  sourceModules,
} from "./react-source-runtime.mjs";
const user = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const todo = {
  _id: "33333333-3333-4333-8333-333333333333",
  title: "Synthetic task",
  dueDate: "2026-10-06",
  status: "Open",
  projectName: "Synthetic project",
};
const key = `manual:${todo._id}`;

test('Matrix Actions preserves a date draft when collapsed or resized and exposes no nested planning disclosure', async () => {
  const f = await fixture(() => ({ data: [], count: 0 }));
  const Component = (await f.load('src/components/TodoEisenhowerMatrix.jsx')).default;
  const componentProps = { matrix: f.hook.value, currentUserId: user, today: props.today, isMobile: false, isExternalView: false, onOpenTodo() {}, handleCompleteTodo() {} };
  let root;
  await act(async () => { root = create(React.createElement(Component, componentProps)); });
  const actions = () => root.root.findAllByType('button').find(node => node.props['aria-label'] === `Actions for ${todo.title}`);
  const date = () => root.root.findAllByType('input').find(node => node.props['aria-label']?.startsWith('Personal work day'));
  try {
    await act(async () => actions().props.onClick());
    await act(async () => date().props.onChange({ target: { value: '2099-11-09' } }));
    await act(async () => actions().props.onClick());
    assert.equal(actions().props['aria-expanded'], false);
    assert.equal(date().props.value, '2099-11-09');
    await act(async () => root.update(React.createElement(Component, { ...componentProps, isMobile: true })));
    await act(async () => actions().props.onClick());
    assert.equal(date().props.value, '2099-11-09');
    assert.equal(root.root.findAllByType('article').flatMap(row => row.findAllByType('details')).length, 0);
    await act(async () => root.update(React.createElement(Component, { ...componentProps, deadlineSaves: { [todo._id]: true } })));
    assert.equal(actions().props.disabled, true);
    assert.ok(root.root.findAllByProps({ role: 'status' }).some(node => node.children.join('').includes('Saving')));
  } finally { await act(async () => root.unmount()); await f.hook.close(); }
});
const preference = {
  id: "44444444-4444-4444-8444-444444444444",
  user_id: user,
  task_key: key,
  manual_quadrant: "not_urgent_not_important",
  version: 1,
};
const props = {
  currentUserId: user,
  enabled: true,
  isExternalView: false,
  todos: [todo],
  today: "2026-10-05",
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const placement = (hook) => hook.value.groups.find((q) => q.cards.length)?.id;
async function fixture(handler, globals = {}) {
  const transport = mockTransport(handler);
  const load = await sourceModules(transport, globals);
  const hook = await mountHook(
    (await load("src/hooks/useTodoEisenhowerMatrix.js"))
      .useTodoEisenhowerMatrix,
    props,
  );
  return { hook, transport, load };
}
test("acknowledged priority persists after reload, and deadline changes promote/restore it", async () => {
  let saved = { ...preference };
  const f = await fixture((r) => {
    if (r.operation === "update") {
      saved = { ...saved, ...r.payload, version: 2 };
      return { data: [saved], error: null };
    }
    return { data: [saved], count: 1, error: null };
  });
  try {
    assert.equal(placement(f.hook), "not_urgent_not_important");
    await act(async () => f.hook.value.move(todo, "urgent_not_important"));
    await act(async () => f.hook.value.reload());
    assert.equal(placement(f.hook), "urgent_not_important");
    await f.hook.update({ ...props, today: "2026-10-07" });
    assert.equal(placement(f.hook), "urgent_important");
    assert.equal(await f.hook.value.move(todo, "not_urgent_important"), false);
    await f.hook.update({
      ...props,
      today: "2026-10-07",
      todos: [{ ...todo, dueDate: "2026-10-08" }],
    });
    assert.equal(placement(f.hook), "urgent_not_important");
  } finally {
    await f.hook.close();
  }
});
test("zero-row CAS leaves confirmed priority and offers reload", async () => {
  const f = await fixture((r) =>
    r.operation === "update"
      ? { data: [], error: null }
      : { data: [preference], count: 1, error: null },
  );
  try {
    await act(async () => f.hook.value.move(todo, "urgent_important"));
    assert.equal(placement(f.hook), "not_urgent_not_important");
    assert.match(f.hook.value.error, /changed elsewhere/);
  } finally {
    await f.hook.close();
  }
});
test("failed initial loading does not classify unknown saved preferences", async () => {
  let failing = true;
  const f = await fixture(() =>
    failing
      ? { data: null, error: { message: "Synthetic failed load" } }
      : { data: [preference], count: 1, error: null },
  );
  try {
    assert.equal(f.hook.value.ready, false);
    failing = false;
    await act(async () => f.hook.value.reload());
    assert.equal(f.hook.value.ready, true);
  } finally {
    await f.hook.close();
  }
});
test("delayed account completion and stale callbacks cannot change the next account", async () => {
  const gate = deferred();
  let nextAccount = false;
  const f = await fixture((r) =>
    r.operation === "update"
      ? gate.promise
      : {
          data: nextAccount ? [] : [preference],
          count: nextAccount ? 0 : 1,
          error: null,
        },
  );
  try {
    const stale = f.hook.value.move;
    let saving;
    await act(async () => {
      saving = stale(todo, "urgent_important");
    });
    nextAccount = true;
    await f.hook.update({ ...props, currentUserId: other });
    assert.equal(await stale(todo, "urgent_not_important"), false);
    await act(async () => {
      gate.resolve({
        data: [
          { ...preference, manual_quadrant: "urgent_important", version: 2 },
        ],
        error: null,
      });
      await saving;
    });
    assert.equal(placement(f.hook), "not_urgent_important");
    assert.equal(Object.keys(f.hook.value.pending).length, 0);
  } finally {
    await f.hook.close();
  }
});
test("account first render synchronously hides previous private classification", async () => {
  const transport = mockTransport((r) => ({
    data:
      r.filters.find((f) => f.method === "eq")?.args[1] === user
        ? [preference]
        : [],
    count: r.filters.find((f) => f.method === "eq")?.args[1] === user ? 1 : 0,
    error: null,
  }));
  const load = await sourceModules(transport);
  const useMatrix = (await load("src/hooks/useTodoEisenhowerMatrix.js"))
    .useTodoEisenhowerMatrix;
  const renders = [];
  let root;
  function Probe(p) {
    const value = useMatrix(p);
    renders.push({
      owner: p.currentUserId,
      ready: value.ready,
      quadrant: value.groups.find((g) => g.cards.length)?.id,
    });
    return null;
  }
  try {
    await act(async () => {
      root = create(React.createElement(Probe, props));
    });
    await act(async () =>
      root.update(
        React.createElement(Probe, { ...props, currentUserId: other }),
      ),
    );
    const first = renders.find((r) => r.owner === other);
    assert.equal(first.ready, false);
    assert.notEqual(first.quadrant, "not_urgent_not_important");
  } finally {
    if (root) await act(async () => root.unmount());
  }
});
test("server row cap pagination never marks missing priorities unclassified", async () => {
  const second = { ...todo, _id: other };
  const secondPref = {
    ...preference,
    id: other,
    task_key: `manual:${other}`,
    manual_quadrant: "urgent_not_important",
  };
  const f = await fixture((r) => ({
    data: r.range[0] === 0 ? [preference] : [secondPref],
    count: 2,
    error: null,
  }));
  try {
    await f.hook.update({ ...props, todos: [todo, second] });
    assert.equal(
      f.hook.value.groups.find((g) => g.id === "urgent_not_important").cards
        .length,
      1,
    );
    assert.equal(f.hook.value.ready, true);
  } finally {
    await f.hook.close();
  }
});
test("strict overdue and read-only controls cannot issue preference writes", async () => {
  const f = await fixture(() => ({
    data: [preference],
    count: 1,
    error: null,
  }));
  try {
    await f.hook.update({ ...props, today: "2026-10-07" });
    assert.equal(await f.hook.value.move(todo, "not_urgent_important"), false);
    await f.hook.update({ ...props, isExternalView: true });
    assert.equal(await f.hook.value.move(todo, "urgent_important"), false);
    assert.equal(
      f.transport.calls.filter((r) => r.operation !== "select").length,
      0,
    );
  } finally {
    await f.hook.close();
  }
});
test("actual Matrix phone/desktop controls expose placement and completion undo", async () => {
  let saved = { ...preference };
  const f = await fixture((r) => {
    if (r.operation === "update")
      saved = { ...saved, ...r.payload, version: saved.version + 1 };
    return { data: [saved], count: 1, error: null };
  });
  let root;
  try {
    const Component = (await f.load("src/components/TodoEisenhowerMatrix.jsx"))
      .default;
    let completed = 0;
    for (const isMobile of [false, true]) {
      await act(async () => {
        root = create(
          React.createElement(Component, {
            matrix: f.hook.value,
            isMobile,
            isExternalView: false,
            onOpenTodo() {},
            handleCompleteTodo() {
              completed++;
            },
            transientTodos: [
              {
                bucketKey: "matrix:urgent_important",
                todo: { ...todo, _id: other, status: "Done" },
              },
            ],
          }),
        );
      });
      assert.equal(root.root.findAllByType("section").length, 4);
      const undo = root.root
        .findAllByType("button")
        .find((b) => b.props["aria-label"]?.startsWith("Undo completion"));
      await act(async () => undo.props.onClick());
      assert.equal(completed, isMobile ? 2 : 1);
      const select = root.root.findByType("select");
      assert.equal(select.props.value, saved.manual_quadrant);
      const destination = isMobile
        ? "not_urgent_important"
        : "urgent_not_important";
      await act(async () =>
        select.props.onChange({ target: { value: destination } }),
      );
      assert.equal(placement(f.hook), destination);
      await act(async () => root.unmount());
      root = null;
    }
  } finally {
    if (root) await act(async () => root.unmount());
    await f.hook.close();
  }
});

test("local day refreshes at midnight and focus resume, cleaning its timers and listeners", async () => {
  let now = new Date(2026, 9, 5, 23, 59, 50).getTime();
  let nextId = 0;
  const timers = new Map(),
    events = new Map();
  class ClockDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
  const target = {
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const load = await sourceModules(
    mockTransport(() => ({ data: [], count: 0, error: null })),
    {
      Date: ClockDate,
      window: target,
      document: target,
      setTimeout: (fn, delay) => {
        timers.set(++nextId, { fn, delay });
        return nextId;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  const useDay = (await load("src/hooks/useLocalCalendarDay.js"))
    .useLocalCalendarDay;
  const hook = await mountHook(useDay, {});
  try {
    assert.equal(hook.value, "2026-10-05");
    assert.ok([...timers.values()][0].delay <= 10050);
    now = new Date(2026, 9, 6, 0, 0, 1).getTime();
    await act(async () => [...timers.values()][0].fn());
    assert.equal(hook.value, "2026-10-06");
    now = new Date(2026, 9, 10, 12).getTime();
    await act(async () => events.get("focus")());
    assert.equal(hook.value, "2026-10-10");
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/London") {
      now = new Date("2026-03-29T00:01:00Z").getTime();
      await act(async () => events.get("pageshow")());
      assert.equal(hook.value, "2026-03-29");
      assert.ok([...timers.values()][0].delay < 23 * 60 * 60 * 1000);
      now = new Date("2026-10-25T00:01:00+01:00").getTime();
      await act(async () => events.get("focus")());
      assert.equal(hook.value, "2026-10-25");
      assert.ok([...timers.values()][0].delay > 24 * 60 * 60 * 1000);
    }
  } finally {
    await hook.close();
    assert.equal(timers.size, 0);
    assert.equal(events.size, 0);
  }
});

test("completing a task keeps transient Undo reachable while remaining-key refresh is pending", async () => {
  const gate = deferred();
  let delay = false;
  const second = { ...todo, _id: other };
  const f = await fixture(() =>
    delay ? gate.promise : { data: [preference], count: 1, error: null },
  );
  let root;
  try {
    await f.hook.update({ ...props, todos: [todo, second] });
    delay = true;
    await f.hook.update({ ...props, todos: [second] });
    assert.equal(f.hook.value.ready, true);
    const Component = (await f.load("src/components/TodoEisenhowerMatrix.jsx"))
      .default;
    await act(async () => {
      root = create(
        React.createElement(Component, {
          matrix: f.hook.value,
          isMobile: true,
          isExternalView: false,
          onOpenTodo() {},
          handleCompleteTodo() {},
          transientTodos: [
            {
              bucketKey: "matrix:not_urgent_not_important",
              todo: { ...todo, status: "Done" },
            },
          ],
        }),
      );
    });
    assert.equal(
      root.root
        .findAllByType("button")
        .filter((b) => b.props["aria-label"]?.startsWith("Undo completion"))
        .length,
      1,
    );
    await act(async () => gate.resolve({ data: [], count: 0, error: null }));
  } finally {
    if (root) await act(async () => root.unmount());
    await f.hook.close();
  }
});
test("duplicate pagination results fail loading rather than invent default priorities", async () => {
  const f = await fixture(() => ({
    data: [preference],
    count: 2,
    error: null,
  }));
  try {
    assert.equal(f.hook.value.ready, false);
    assert.match(f.hook.value.error, /Unable to load/);
  } finally {
    await f.hook.close();
  }
});
test("offline retains confirmed priorities, refuses moves and reloads on reconnect", async () => {
  const events = new Map();
  const navigator = { onLine: true };
  const window = {
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const f = await fixture(
    () => ({ data: [preference], count: 1, error: null }),
    { navigator, window },
  );
  try {
    navigator.onLine = false;
    await act(async () => events.get("offline")());
    assert.equal(f.hook.value.offline, true);
    assert.equal(placement(f.hook), "not_urgent_not_important");
    assert.equal(await f.hook.value.move(todo, "urgent_important"), false);
    assert.equal(
      f.transport.calls.filter((r) => r.operation !== "select").length,
      0,
    );
    navigator.onLine = true;
    await act(async () => events.get("online")());
    assert.equal(f.hook.value.offline, false);
    assert.equal(f.hook.value.error, "");
  } finally {
    await f.hook.close();
    assert.equal(events.size, 0);
  }
});
