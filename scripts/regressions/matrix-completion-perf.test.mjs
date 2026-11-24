import assert from 'node:assert/strict';
import test from 'node:test';
import {
  React,
  act,
  create,
  mockTransport,
  mountHook,
  sourceModules,
} from './react-source-runtime.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const projectOneId = '22222222-2222-4222-8222-222222222222';
const projectTwoId = '33333333-3333-4333-8333-333333333333';
const todoOneId = '44444444-4444-4444-8444-444444444444';
const todoTwoId = '55555555-5555-4555-8555-555555555555';
const todoThreeId = '66666666-6666-4666-8666-666666666666';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const flushMicrotasks = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
};

const nodeText = (node) => {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const kids = Array.isArray(node.children) ? node.children : [];
  return kids.map((child) => nodeText(child)).join(' ');
};

function makeManualTimerDriver() {
  let nextId = 1;
  const timers = new Map();
  return {
    timers,
    setTimeout(fn, delay) {
      const id = nextId++;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async runAll() {
      const entries = [...timers.entries()];
      timers.clear();
      for (const [, entry] of entries) {
        await entry.fn();
      }
      await flushMicrotasks();
    },
  };
}

function makeMatrixWindow({ matrixMode = true, timerDriver = null, storageInitial = {} } = {}) {
  const store = new Map([
    ['pmworkspace:todo-view-mode:v1', matrixMode ? '{"mode":"matrix"}' : '{"mode":"list"}'],
    ['pmworkspace:todo-command-state:v1', '{"scope":"all","focusView":"all"}'],
    ...Object.entries(storageInitial),
  ]);
  const storage = {
    get length() {
      return store.size;
    },
    key: (index) => [...store.keys()][index] ?? null,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const winListeners = new Map();
  const docListeners = new Map();
  const window = {
    localStorage: storage,
    sessionStorage: storage,
    addEventListener: (name, fn) => winListeners.set(name, fn),
    removeEventListener: (name) => winListeners.delete(name),
    setTimeout: timerDriver
      ? (fn, delay) => timerDriver.setTimeout(fn, delay)
      : (fn, delay) => setTimeout(fn, delay === 1600 ? 0 : delay),
    clearTimeout: timerDriver ? (id) => timerDriver.clearTimeout(id) : clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: clearTimeout,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, fn) => docListeners.set(name, fn),
    removeEventListener: (name) => docListeners.delete(name),
  };
  return { window, document, winListeners, docListeners, store };
}

test('matrix preference hook skips queries on completion removal and fetches only uncovered delta keys without dropping readiness', async () => {
  const todoA = { _id: todoOneId, title: 'Task A', dueDate: '2026-10-08', status: 'Open' };
  const todoB = { _id: todoTwoId, title: 'Task B', dueDate: '2026-10-09', status: 'Open' };
  const todoC = { _id: todoThreeId, title: 'Follow-up C', dueDate: '2026-10-15', status: 'Open' };

  const prefRows = {
    [`manual:${todoOneId}`]: {
      id: '77777777-7777-4777-8777-777777777771',
      user_id: owner,
      task_key: `manual:${todoOneId}`,
      manual_quadrant: 'urgent_important',
      version: 1,
    },
    [`manual:${todoTwoId}`]: {
      id: '77777777-7777-4777-8777-777777777772',
      user_id: owner,
      task_key: `manual:${todoTwoId}`,
      manual_quadrant: 'not_urgent_important',
      version: 1,
    },
  };
  let deltaGate = null;

  const transport = mockTransport(async (request) => {
    if (request.table === 'task_eisenhower_preferences' && request.operation === 'select') {
      const requested = request.filters.find((f) => f.method === 'in')?.args?.[1] || [];
      if (deltaGate && requested.includes(`manual:${todoThreeId}`)) {
        await deltaGate.promise;
      }
      const rows = requested.map((k) => prefRows[k]).filter(Boolean);
      return { data: rows, count: rows.length, error: null };
    }
    return { data: [], count: 0, error: null };
  });

  const load = await sourceModules(transport);
  const { useTodoEisenhowerMatrix } = await load('src/hooks/useTodoEisenhowerMatrix.js');
  const baseProps = {
    currentUserId: owner,
    isExternalView: false,
    enabled: true,
    todos: [todoA, todoB],
    today: '2026-10-08',
  };
  const hook = await mountHook(useTodoEisenhowerMatrix, baseProps);

  try {
    assert.equal(hook.value.ready, true);
    assert.equal(hook.value.loading, false);
    assert.equal(hook.value.syncing, false);
    const selectCountAfterInit = transport.calls.filter((c) => c.table === 'task_eisenhower_preferences').length;
    assert.equal(selectCountAfterInit, 1);

    // Removing a completed task issues 0 queries and keeps Matrix ready.
    await hook.update({ ...baseProps, todos: [todoB] });
    assert.equal(transport.calls.filter((c) => c.table === 'task_eisenhower_preferences').length, selectCountAfterInit);
    assert.equal(hook.value.ready, true);
    assert.equal(hook.value.loading, false);
    assert.equal(hook.value.syncing, false);

    // Adding an uncovered task issues ONLY a 1-key delta query and keeps Matrix mounted & ready.
    deltaGate = deferred();
    prefRows[`manual:${todoThreeId}`] = {
      id: '77777777-7777-4777-8777-777777777773',
      user_id: owner,
      task_key: `manual:${todoThreeId}`,
      manual_quadrant: 'urgent_important',
      version: 1,
    };

    await hook.update({ ...baseProps, todos: [todoB, todoC] });
    const prefSelects = transport.calls.filter((c) => c.table === 'task_eisenhower_preferences' && c.operation === 'select');
    assert.equal(prefSelects.length, selectCountAfterInit + 1);
    const deltaKeys = prefSelects.at(-1).filters.find((f) => f.method === 'in').args[1];
    assert.deepEqual(deltaKeys, [`manual:${todoThreeId}`]);

    assert.equal(hook.value.ready, true);
    assert.equal(hook.value.loading, false);
    assert.equal(hook.value.syncing, true);
    assert.equal(hook.value.isKeyCovered(`manual:${todoTwoId}`), true);
    assert.equal(hook.value.isKeyCovered(`manual:${todoThreeId}`), false);

    // Uncovered task is withheld from groups and cannot be mutated before read confirmation.
    const visibleIdsWhilePending = [...hook.value.groups.flatMap((g) => g.cards.map((c) => c.todo._id))];
    assert.deepEqual(visibleIdsWhilePending, [todoTwoId]);
    assert.equal(await hook.value.move(todoC, 'urgent_not_important'), false);

    await act(async () => {
      deltaGate.resolve();
      await flushMicrotasks();
    });

    assert.equal(hook.value.syncing, false);
    assert.equal(hook.value.isKeyCovered(`manual:${todoThreeId}`), true);
    assert.ok(hook.value.groups.find((g) => g.id === 'urgent_important').cards.some((c) => c.todo._id === todoThreeId));
  } finally {
    await hook.close();
  }
});

test('completing the last visible recurring Today task never unmounts Matrix and avoids duplicate project queries', async () => {
  const followUpGate = deferred();
  const followUpPrefKey = `manual:${todoTwoId}`;
  const recurringParent = {
    _id: todoOneId,
    projectId: projectOneId,
    title: 'Weekly review',
    dueDate: '2026-10-08',
    owner: 'Owner',
    status: 'Open',
    recurrence: { type: 'weekly', interval: 1 },
  };
  const project = { id: projectOneId, name: 'Alpha', tasks: [], registers: {}, tracker: [], version: 1 };

  const timerDriver = makeManualTimerDriver();
  const { window, document } = makeMatrixWindow({ timerDriver });
  const todayStorage = {
    ...window.localStorage,
    getItem: (key) => {
      if (key === 'pmworkspace:todo-view-mode:v1') return '{"mode":"matrix"}';
      if (key === 'pmworkspace:todo-command-state:v1') return '{"scope":"all","focusView":"today"}';
      return null;
    },
  };
  window.localStorage = todayStorage;
  window.sessionStorage = todayStorage;

  const transport = mockTransport(async (request) => {
    if (request.table === 'projects') {
      return { data: [project], count: 1, error: null };
    }
    if (request.table === 'manual_todos') {
      return {
        data: [{
          id: todoOneId,
          project_id: projectOneId,
          title: 'Weekly review',
          due_date: '2026-10-08',
          owner_text: 'Owner',
          status: 'Open',
          recurrence: { type: 'weekly', interval: 1 },
        }],
        count: 1,
        error: null,
      };
    }
    if (request.table === 'task_eisenhower_preferences') {
      const requested = request.filters.find((f) => f.method === 'in')?.args?.[1] || [];
      if (requested.includes(followUpPrefKey)) {
        await followUpGate.promise;
      }
      return { data: [], count: 0, error: null };
    }
    return { data: [], count: 0, error: null };
  });

  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;

  let root;
  function Harness() {
    const [todos, setTodos] = React.useState([recurringParent]);
    return React.createElement(TodoView, {
      todos,
      currentProject: project,
      projectData: [],
      registers: {},
      tracker: [],
      currentUserId: owner,
      currentUserName: 'Owner',
      isExternalView: false,
      onCompleteTodo: async () => ({ ok: true }),
      onUpdateTodo: async (_id, _field, _value, original) => {
        const updatedTodo = { ...original, status: 'Done', completedAt: '2026-10-08T12:00:00Z' };
        const followUpTodo = {
          ...original,
          _id: todoTwoId,
          dueDate: '2026-10-15',
          status: 'Open',
          completedAt: '',
        };
        setTodos([updatedTodo, followUpTodo]);
        return { updatedTodo, followUpTodo, confirmed: true };
      },
    });
  }

  await act(async () => {
    root = create(React.createElement(Harness));
  });

  try {
    // Only 1 initial projects fetch in scope='all' (loadProjectOptions skipped).
    assert.equal(transport.calls.filter((c) => c.table === 'projects').length, 1);

    const matrix = root.root.findByType(Matrix);
    const completeBtn = matrix.findAllByType('button').find((b) => b.props['aria-label'] === 'Complete Weekly review');
    await act(async () => {
      completeBtn.props.onClick();
    });

    // Card immediately removed from its quadrant, and floating Undo toast rendered.
    assert.equal(root.root.findByType(Matrix).findAllByType('article').length, 0);
    assert.ok(
      root.root.findAllByType('button').some((b) => b.props['aria-label'] === 'Undo completion for Weekly review')
    );

    // Fire timer: follow-up enters future bucket (visibleOpenTodos === 0 in Today) while delta pref read is still pending.
    await act(async () => {
      await timerDriver.runAll();
    });

    // Matrix MUST stay mounted and never show "Checking your personal plan…" or "Loading your priorities…".
    assert.equal(root.root.findAllByType(Matrix).length, 1);
    const renderedText = JSON.stringify(root.toJSON());
    assert.equal(renderedText.includes('Loading your priorities'), false);
    assert.equal(renderedText.includes('Checking your personal plan'), false);

    await act(async () => {
      followUpGate.resolve();
      await flushMicrotasks();
    });
    assert.equal(root.root.findAllByType(Matrix).length, 1);
  } finally {
    await act(async () => root.unmount());
  }
});

test('checklist hook performs 0 fetches when completing or undoing tasks and delta-fetches only new scopes', async () => {
  const checklistA = { id: 'list-a', user_id: owner, project_id: projectOneId, card_key: `manual:${todoOneId}`, title: 'List A', position: 0 };
  const checklistB = { id: 'list-b', user_id: owner, project_id: projectOneId, card_key: `manual:${todoTwoId}`, title: 'List B', position: 0 };
  const checklistC = { id: 'list-c', user_id: owner, project_id: projectOneId, card_key: `manual:${todoThreeId}`, title: 'List C', position: 0 };
  const items = [
    { id: 'item-a', checklist_id: 'list-a', user_id: owner, project_id: projectOneId, title: 'Step A', checked: false, position: 0 },
    { id: 'item-b', checklist_id: 'list-b', user_id: owner, project_id: projectOneId, title: 'Step B', checked: false, position: 0 },
    { id: 'item-c', checklist_id: 'list-c', user_id: owner, project_id: projectOneId, title: 'Step C', checked: false, position: 0 },
  ];

  const transport = mockTransport((request) => {
    if (request.table === 'task_card_checklists') {
      const cardKeys = request.filters.find((f) => f.method === 'in' && f.args[0] === 'card_key')?.args?.[1] || [];
      return {
        data: [checklistA, checklistB, checklistC].filter((c) => cardKeys.includes(c.card_key)),
        error: null,
      };
    }
    if (request.table === 'task_card_checklist_items') {
      const ids = request.filters.find((f) => f.method === 'in' && f.args[0] === 'checklist_id')?.args?.[1] || [];
      return {
        data: items.filter((i) => ids.includes(i.checklist_id)),
        error: null,
      };
    }
    return { data: [], error: null };
  });

  const load = await sourceModules(transport);
  const { useTaskCardChecklists } = await load('src/hooks/useTaskCardChecklists.js');
  const tA = { _id: todoOneId, projectId: projectOneId };
  const tB = { _id: todoTwoId, projectId: projectOneId };
  const tC = { _id: todoThreeId, projectId: projectOneId };

  const hook = await mountHook(useTaskCardChecklists, { currentUserId: owner, isExternalView: false, todos: [tA, tB] });
  try {
    const initialCalls = transport.calls.length;
    assert.equal(initialCalls, 2);

    // Completing tA removes it from visible list: 0 fetches, tB remains cached.
    await hook.update({ currentUserId: owner, isExternalView: false, todos: [tB] });
    assert.equal(transport.calls.length, initialCalls);
    assert.equal(hook.value.checklistsLoading, false);
    assert.equal(hook.value.getChecklistsForTodo(tB)[0].title, 'List B');

    // Undoing tA restores it: still 0 fetches, cached tA remains available.
    await hook.update({ currentUserId: owner, isExternalView: false, todos: [tA, tB] });
    assert.equal(transport.calls.length, initialCalls);
    assert.equal(hook.value.getChecklistsForTodo(tA)[0].title, 'List A');

    // Adding tC fetches ONLY tC's card_key and keeps A & B intact.
    await hook.update({ currentUserId: owner, isExternalView: false, todos: [tA, tB, tC] });
    const deltaChecklistCalls = transport.calls.slice(initialCalls).filter((c) => c.table === 'task_card_checklists');
    assert.equal(deltaChecklistCalls.length, 1);
    const queriedCardKeys = deltaChecklistCalls[0].filters.find((f) => f.args[0] === 'card_key').args[1];
    assert.deepEqual(queriedCardKeys, [`manual:${todoThreeId}`]);
    assert.equal(hook.value.getChecklistsForTodo(tA)[0].title, 'List A');
    assert.equal(hook.value.getChecklistsForTodo(tC)[0].title, 'List C');

    // Explicit retry runs a full reload across all active scopes.
    const beforeRetry = transport.calls.length;
    await act(async () => {
      await hook.value.retryChecklists();
    });
    const fullCall = transport.calls.slice(beforeRetry).find((c) => c.table === 'task_card_checklists');
    const fullKeys = fullCall.filters.find((f) => f.args[0] === 'card_key').args[1];
    assert.equal(fullKeys.length, 3);
  } finally {
    await hook.close();
  }
});

test('pending completions stay alive across leaving/returning to Tasks and stop cleanly on sign-out or same-user re-auth', async () => {
  const timerDriver = makeManualTimerDriver();
  const { window, document } = makeMatrixWindow({ timerDriver });
  const inFlightGate = deferred();
  let holdSecondUpdate = false;

  const taskOne = { _id: todoOneId, projectId: projectOneId, title: 'Task survives tab switch', dueDate: '2026-10-08', status: 'Open' };
  const taskTwo = { _id: todoTwoId, projectId: projectOneId, title: 'Task stopped by sign-out', dueDate: '2026-10-08', status: 'Open' };
  const taskThree = { _id: todoThreeId, projectId: projectOneId, title: 'In-flight fenced by sign-out', dueDate: '2026-10-08', status: 'Open' };
  const project = { id: projectOneId, name: 'Alpha', tasks: [], registers: {}, tracker: [], version: 1 };

  const transport = mockTransport(async (request) => {
    if (request.table === 'projects') return { data: [project], count: 1, error: null };
    if (request.table === 'manual_todos' && request.operation === 'select') {
      return {
        data: [taskOne, taskTwo, taskThree].map((item) => ({
          id: item._id,
          project_id: item.projectId,
          title: item.title,
          due_date: item.dueDate,
          status: item.status,
          recurrence: item._id === todoThreeId ? { type: 'weekly', interval: 1 } : null,
        })),
        count: 3,
        error: null,
      };
    }
    if (request.table === 'manual_todos' && request.operation === 'update') {
      const id = request.filters.find((f) => f.args[0] === 'id')?.args?.[1];
      if (holdSecondUpdate && id === todoThreeId) {
        await inFlightGate.promise;
      }
      return {
        data: {
          id,
          project_id: projectOneId,
          title: id === todoThreeId ? 'In-flight fenced by sign-out' : 'Task survives tab switch',
          due_date: '2026-10-08',
          status: 'Done',
          user_id: owner,
        },
        error: null,
      };
    }
    if (request.table === 'manual_todos' && request.operation === 'insert') {
      return { data: { ...request.payload, created_at: '2026-10-08T00:00:00Z' }, error: null };
    }
    return { data: [], count: 0, error: null };
  });

  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const { createTaskCompletionSession } = await load('src/utils/taskCompletionSession.js');
  const TaskCompletionSessionOverlay = (await load('src/components/TaskCompletionSessionOverlay.jsx')).default;
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;

  const session = createTaskCompletionSession({
    initialUserId: owner,
    setTimer: (fn, delay) => timerDriver.setTimeout(fn, delay),
    clearTimer: (id) => timerDriver.clearTimeout(id),
  });

  let overlayRoot;
  let todoRoot;
  let updates = [];

  const mountTodoView = async (propsOverride = {}) => {
    await act(async () => {
      todoRoot = create(React.createElement(() => {
        const [localTodos, setLocalTodos] = React.useState([taskOne, taskTwo, taskThree]);
        React.useEffect(() => session.subscribeManualResults((result) => {
          if (result?.updatedTodo) {
            setLocalTodos((prev) => prev.map((t) => (t._id === result.updatedTodo._id ? result.updatedTodo : t)));
          }
        }), []);
        return React.createElement(TodoView, {
          todos: localTodos,
          currentProject: project,
          projectData: [],
          registers: {},
          tracker: [],
          currentUserId: owner,
          currentUserName: 'Owner',
          isExternalView: false,
          completionSession: session,
          isWorkspaceMounted: () => false,
          onCompleteTodo: async () => ({ ok: true }),
          onUpdateTodo: async (id, field, value, original) => {
            updates.push({ id, field, value });
            const next = { ...original, [field]: value };
            setLocalTodos((prev) => prev.map((t) => (t._id === id ? next : t)));
            return { updatedTodo: next, confirmed: true };
          },
          ...propsOverride,
        });
      }));
    });
  };

  await act(async () => {
    overlayRoot = create(React.createElement(TaskCompletionSessionOverlay, { session, userId: owner }));
  });
  await mountTodoView();

  try {
    // 1) Schedule completion and immediately leave Tasks (unmount TodoView).
    const btnOne = todoRoot.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.props['aria-label'] === 'Complete Task survives tab switch');
    await act(async () => {
      btnOne.props.onClick();
    });

    await act(async () => {
      todoRoot.unmount();
    });
    todoRoot = null;

    // Pending completion survives unmount, shows Undo toast in overlay, and has not written yet.
    assert.equal(transport.calls.some((c) => c.table === 'manual_todos' && c.operation === 'update'), false);
    assert.ok(
      overlayRoot.root.findAllByType('button').some((b) => b.props['aria-label'] === 'Undo completion for Task survives tab switch')
    );

    // Remount TodoView before timer expires, then let timer commit cleanly via direct session persistence.
    await mountTodoView();
    await act(async () => {
      await timerDriver.runAll();
    });

    const manualUpdatesAfterTaskOne = transport.calls.filter((c) => c.table === 'manual_todos' && c.operation === 'update');
    assert.equal(manualUpdatesAfterTaskOne.length, 1);
    assert.equal(manualUpdatesAfterTaskOne[0].filters.find((f) => f.args[0] === 'id').args[1], todoOneId);
    // Task 1 was removed from remounted TodoView open cards.
    assert.equal(
      todoRoot.root.findByType(Matrix).findAllByType('button')
        .some((b) => b.props['aria-label'] === 'Complete Task survives tab switch'),
      false
    );

    // 2) Pending completion + in-flight completion MUST both stop on sign-out / A -> signed out -> A.
    holdSecondUpdate = true;
    const btnTwo = todoRoot.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.props['aria-label'] === 'Complete Task stopped by sign-out');
    const btnThree = todoRoot.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.props['aria-label'] === 'Complete In-flight fenced by sign-out');
    await act(async () => {
      btnThree.props.onClick();
    });
    // Start btnThree committing via timer while btnTwo is only pending.
    await act(async () => {
      // Run btnThree's timer without finishing inFlightGate
      const [firstId, firstEntry] = [...timerDriver.timers.entries()][0];
      timerDriver.timers.delete(firstId);
      void firstEntry.fn();
      await flushMicrotasks();
    });
    await act(async () => {
      btnTwo.props.onClick();
    });

    // Leave Tasks again while btnTwo is pending & btnThree is in flight.
    await act(async () => {
      todoRoot.unmount();
    });
    todoRoot = null;
    assert.equal(timerDriver.timers.size > 0, true);

    // Simulate sign-out then immediate sign-in as the same user A.
    await act(async () => {
      session.revoke();
      session.setOwner(owner);
      await flushMicrotasks();
    });

    // Pending timer for Task 2 was cancelled immediately and overlay cleared.
    assert.equal(session.getSnapshot().pendingEntries.length, 0);
    assert.equal(overlayRoot.toJSON(), null);

    await act(async () => {
      await timerDriver.runAll();
      inFlightGate.resolve();
      await flushMicrotasks();
    });

    // Task 2 NEVER wrote; Task 3 was fenced before creating recurring follow-up or alerts in fresh session!
    const allManualUpdates = transport.calls.filter((c) => c.table === 'manual_todos' && c.operation === 'update');
    assert.equal(allManualUpdates.some((c) => c.filters.some((f) => f.args[1] === todoTwoId)), false);
    assert.equal(transport.calls.filter((c) => c.table === 'manual_todos' && c.operation === 'insert').length, 0);
    assert.equal(session.getSnapshot().alert, '');
  } finally {
    if (todoRoot) await act(async () => todoRoot.unmount());
    await act(async () => overlayRoot.unmount());
    session.dispose();
  }
});

test('rapid same-project derived completions serialize CAS versions and surface conflicts or save errors visibly', async () => {
  const timerDriver = makeManualTimerDriver();
  const { window, document } = makeMatrixWindow({ timerDriver });
  const firstUpdateGate = deferred();
  let remoteVersion = 1;
  let forceConflictOnNextProjectUpdate = false;
  let failManualUpdate = false;

  const projectOne = { id: projectOneId, name: 'Current', tasks: [], registers: {}, tracker: [], version: 1 };
  let remoteProject = {
    id: projectTwoId,
    name: 'Remote Project',
    version: 1,
    tasks: [],
    tracker: [],
    registers: {
      actions: [
        { _id: 'act-1', description: 'Remote action 1', status: 'Open', target: '2026-10-08', visible: true },
        { _id: 'act-2', description: 'Remote action 2', status: 'Open', target: '2026-10-08', visible: true },
        { _id: 'act-3', description: 'Remote action 3', status: 'Open', target: '2026-10-08', visible: true },
      ],
    },
  };
  const manualTodo = {
    _id: todoOneId,
    projectId: projectTwoId,
    title: 'Manual fail restore',
    dueDate: '2026-10-08',
    status: 'Open',
  };

  let projectUpdateCount = 0;
  const projectUpdateExpectations = [];

  const transport = mockTransport(async (request) => {
    if (request.table === 'projects' && request.operation === 'select') {
      return { data: [projectOne, structuredClone(remoteProject)], count: 2, error: null };
    }
    if (request.table === 'projects' && request.operation === 'update') {
      projectUpdateCount += 1;
      const expectedVersion = request.filters.find((f) => f.args[0] === 'version')?.args?.[1];
      projectUpdateExpectations.push({
        call: projectUpdateCount,
        expectedVersion,
        completedIds: request.payload.registers.actions.filter((a) => a.status === 'Completed').map((a) => a._id),
      });
      if (projectUpdateCount === 1) {
        await firstUpdateGate.promise;
      }
      if (forceConflictOnNextProjectUpdate) {
        forceConflictOnNextProjectUpdate = false;
        return { data: null, error: null };
      }
      remoteVersion += 1;
      remoteProject = { ...remoteProject, ...request.payload, version: remoteVersion };
      return { data: { version: remoteVersion }, error: null };
    }
    if (request.table === 'manual_todos' && request.operation === 'select') {
      return {
        data: [{ id: todoOneId, project_id: projectTwoId, title: 'Manual fail restore', due_date: '2026-10-08', status: 'Open' }],
        count: 1,
        error: null,
      };
    }
    return { data: [], count: 0, error: null };
  });

  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;

  let root;
  await act(async () => {
    root = create(React.createElement(TodoView, {
      todos: [],
      currentProject: projectOne,
      projectData: [],
      registers: {},
      tracker: [],
      currentUserId: owner,
      currentUserName: 'Owner',
      isExternalView: false,
      onCompleteTodo: async () => ({ ok: true }),
      onUpdateTodo: async (_id, _field, _value, original) => (
        failManualUpdate ? null : { updatedTodo: { ...original, status: 'Done' }, confirmed: true }
      ),
    }));
  });

  try {
    const completeButton = (title) => root.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.props['aria-label'] === `Complete ${title}`);

    // Trigger both Remote action 1 and Remote action 2 rapidly.
    await act(async () => {
      completeButton('Remote action 1').props.onClick();
      completeButton('Remote action 2').props.onClick();
    });

    // Fire timers -> only the 1st CAS write should start while firstUpdateGate is pending.
    await act(async () => {
      await timerDriver.runAll();
    });
    assert.equal(projectUpdateCount, 1);
    assert.equal(projectUpdateExpectations[0].expectedVersion, 1);

    await act(async () => {
      firstUpdateGate.resolve();
      await flushMicrotasks();
    });

    // 2nd CAS write uses latest confirmed version 2 and preserves BOTH completed actions.
    assert.equal(projectUpdateCount, 2);
    assert.equal(projectUpdateExpectations[1].expectedVersion, 2);
    assert.deepEqual(projectUpdateExpectations[1].completedIds, ['act-1', 'act-2']);

    // Simulate external CAS conflict on action 3: task must restore and surface role="alert".
    forceConflictOnNextProjectUpdate = true;
    await act(async () => {
      completeButton('Remote action 3').props.onClick();
    });
    await act(async () => {
      await timerDriver.runAll();
    });

    assert.ok(completeButton('Remote action 3'));
    assert.ok(
      root.root.findAllByProps({ role: 'alert' })
        .some((node) => nodeText(node).includes('Remote action 3'))
    );

    // Simulate manual todo DB failure: task must restore to Open and surface role="alert".
    failManualUpdate = true;
    await act(async () => {
      completeButton(manualTodo.title).props.onClick();
    });
    await act(async () => {
      await timerDriver.runAll();
    });

    assert.ok(completeButton(manualTodo.title));
    assert.ok(
      root.root.findAllByProps({ role: 'alert' })
        .some((node) => nodeText(node).includes(manualTodo.title))
    );
  } finally {
    await act(async () => root.unmount());
  }
});

test('failed recurring follow-up is recoverable without duplicates across outage, lost-ACK, tabs, and page reload', async () => {
  let dbRows = new Map([
    [todoOneId, {
      id: todoOneId,
      user_id: owner,
      project_id: projectOneId,
      title: 'Weekly payroll',
      description: 'Original notes',
      due_date: '2026-10-08',
      owner_text: 'Owner',
      assignee_user_id: owner,
      status: 'Open',
      recurrence: { type: 'weekly', interval: 1 },
      completed_at: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    }],
  ]);

  let insertMode = 'fail-before-write';
  let insertAttempts = 0;

  const transport = mockTransport((request) => {
    if (request.operation === 'rpc' && request.name === 'complete_recurring_manual_todo_v1') {
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.complete_recurring_manual_todo_v1' } };
    }
    if (request.table === 'projects') {
      return { data: [{ id: projectOneId, name: 'Ops', tasks: [], registers: {}, tracker: [], version: 1 }], count: 1, error: null };
    }
    if (request.table === 'manual_todos' && request.operation === 'select') {
      const idFilter = request.filters.find((f) => f.args[0] === 'id')?.args?.[1];
      if (idFilter) {
        if (insertMode === 'fail-after-write-block-reconcile') {
          return { data: null, error: { message: 'Temporary reconcile outage' } };
        }
        return { data: dbRows.get(idFilter) || null, error: null };
      }
      const openRows = [...dbRows.values()].filter((r) => r.status !== 'Done');
      return { data: openRows, count: openRows.length, error: null };
    }
    if (request.table === 'manual_todos' && request.operation === 'update') {
      const id = request.filters.find((f) => f.args[0] === 'id')?.args?.[1];
      const existing = dbRows.get(id);
      const updated = { ...existing, ...request.payload };
      dbRows.set(id, updated);
      return { data: updated, error: null };
    }
    if (request.table === 'manual_todos' && request.operation === 'insert') {
      insertAttempts += 1;
      assert.equal(request.payload.meta?.recurrenceSourceTodoId, todoOneId);
      if (insertMode === 'fail-before-write') {
        return { data: null, error: { message: 'Synthetic outage before insert' } };
      }
      const created = { ...request.payload, created_at: '2026-10-08T00:00:00Z', updated_at: '2026-10-08T00:00:00Z' };
      dbRows.set(created.id, created);
      if (insertMode === 'fail-after-write-block-reconcile') {
        return { data: null, error: { message: 'Synthetic lost acknowledgement' } };
      }
      return { data: created, error: null };
    }
    return { data: [], count: 0, error: null };
  });

  const timerDriver = makeManualTimerDriver();
  const { window, document } = makeMatrixWindow({ timerDriver });
  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const { useProjectTodos } = await load('src/hooks/projectData/useProjectTodos.js');
  const { deriveRecurringFollowUpId } = await load('src/hooks/projectData/recurringFollowUp.js');
  const { createTaskCompletionSession } = await load('src/utils/taskCompletionSession.js');
  const TaskCompletionSessionOverlay = (await load('src/components/TaskCompletionSessionOverlay.jsx')).default;
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;

  const tabOneSession = createTaskCompletionSession({
    initialUserId: owner,
    storage: window.localStorage,
    setTimer: (fn, delay) => timerDriver.setTimeout(fn, delay),
    clearTimer: (id) => timerDriver.clearTimeout(id),
  });
  const tabTwoSession = createTaskCompletionSession({
    initialUserId: owner,
    storage: window.localStorage,
  });
  const deterministicFollowUpId = deriveRecurringFollowUpId(todoOneId);
  assert.equal(tabOneSession.getOrCreateRecurringFollowUpId(todoOneId), deterministicFollowUpId);
  assert.equal(tabTwoSession.getOrCreateRecurringFollowUpId(todoOneId), deterministicFollowUpId);
  tabTwoSession.dispose();

  const project = { id: projectOneId, name: 'Ops', tasks: [], registers: {}, tracker: [], version: 1 };

  let hookRef;
  function makeHarness(sessionInstance) {
    return function Harness() {
      const todoState = useProjectTodos({
        completionSession: sessionInstance,
        isOnline: true,
        now: () => '2026-10-08T12:00:00Z',
        projectId: projectOneId,
        setLastSaved() {},
        setOfflinePendingSync() {},
        setUsingOfflineSnapshot() {},
        userId: owner,
      });
      hookRef = todoState;
      React.useEffect(() => {
        void todoState.loadTodos();
      }, []);
      return React.createElement(TodoView, {
        todos: todoState.todos,
        currentProject: project,
        projectData: [],
        registers: {},
        tracker: [],
        currentUserId: owner,
        currentUserName: 'Owner',
        isExternalView: false,
        completionSession: sessionInstance,
        onCompleteTodo: async () => ({ ok: true }),
        onUpdateTodo: todoState.updateTodo,
        onRetryRecurringFollowUp: todoState.retryRecurringFollowUp,
      });
    };
  }

  let root;
  let reloadedOverlayRoot = null;
  let reloadedSession = null;
  await act(async () => {
    root = create(React.createElement(makeHarness(tabOneSession)));
  });

  try {
    // 1) Failing insert before DB write: parent is Done, NO ghost row, recovery persisted cleanly.
    const completeBtn = root.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.props['aria-label'] === 'Complete Weekly payroll');
    await act(async () => {
      completeBtn.props.onClick();
    });
    await act(async () => {
      await timerDriver.runAll();
    });

    assert.equal(dbRows.get(todoOneId).status, 'Done');
    assert.equal(hookRef.todos.filter((t) => t.status === 'Open').length, 0);
    assert.equal(dbRows.size, 1);

    const persistedRaw = window.localStorage.getItem(`pmworkspace:recurring-recovery:v1:${owner}`);
    assert.ok(persistedRaw);
    const persisted = JSON.parse(persistedRaw);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].id, deterministicFollowUpId);

    // 2) Simulate full page reload before returning to Tasks: unmount TodoView & tear down in-memory session.
    await act(async () => {
      root.unmount();
    });
    root = null;
    tabOneSession.revoke();

    reloadedSession = createTaskCompletionSession({
      initialUserId: owner,
      storage: window.localStorage,
      setTimer: (fn, delay) => timerDriver.setTimeout(fn, delay),
      clearTimer: (id) => timerDriver.clearTimeout(id),
    });
    await act(async () => {
      reloadedOverlayRoot = create(React.createElement(TaskCompletionSessionOverlay, {
        session: reloadedSession,
        userId: owner,
      }));
    });

    const overlayRetryBtn = reloadedOverlayRoot.root.findAllByType('button')
      .find((b) => b.children.includes('Retry next occurrence'));
    assert.ok(overlayRetryBtn);

    // Attempt 2 from reloaded overlay (lost ACK): writes row with SAME deterministic ID, keeps recovery persisted.
    insertMode = 'fail-after-write-block-reconcile';
    await act(async () => {
      await overlayRetryBtn.props.onClick();
    });
    assert.equal(insertAttempts, 2);
    assert.equal(dbRows.size, 2);
    assert.ok(dbRows.has(deterministicFollowUpId));
    assert.ok(window.localStorage.getItem(`pmworkspace:recurring-recovery:v1:${owner}`));

    // 3) Re-enter Tasks after reload and retry: reconciles committed row WITHOUT inserting a duplicate!
    await act(async () => {
      root = create(React.createElement(makeHarness(reloadedSession)));
    });
    insertMode = 'ok';
    const retryAgainBtn = root.root.findAllByType('button').find((b) => b.children.includes('Retry next occurrence'));
    assert.ok(retryAgainBtn);
    await act(async () => {
      await retryAgainBtn.props.onClick();
    });

    assert.equal(insertAttempts, 2);
    assert.equal(dbRows.size, 2);
    assert.equal(hookRef.todos.filter((t) => t.status === 'Open').length, 1);
    assert.equal(hookRef.todos.find((t) => t.status === 'Open')._id, deterministicFollowUpId);
    assert.equal(window.localStorage.getItem(`pmworkspace:recurring-recovery:v1:${owner}`), null);
    assert.equal(
      root.root.findAllByType('button').some((b) => b.children.includes('Retry next occurrence')),
      false
    );

    // Explicit sign-out revocation clears any persisted recovery record synchronously.
    reloadedSession.recordRecurringRecovery({
      id: deterministicFollowUpId,
      parentTodoId: todoOneId,
      userId: owner,
      sourceTodo: { _id: todoOneId, projectId: projectOneId, title: 'Weekly payroll' },
      normalizedRecurrence: { type: 'weekly', interval: 1 },
      nextRecurringDueDate: '2026-10-15',
      title: 'Weekly payroll',
    });
    assert.ok(window.localStorage.getItem(`pmworkspace:recurring-recovery:v1:${owner}`));
    reloadedSession.revoke({ clearPersisted: true });
    assert.equal(window.localStorage.getItem(`pmworkspace:recurring-recovery:v1:${owner}`), null);
  } finally {
    if (root) await act(async () => root.unmount());
    if (reloadedOverlayRoot) await act(async () => reloadedOverlayRoot.unmount());
    tabOneSession.dispose();
    reloadedSession?.dispose();
  }
});

test('marking Done finishes saving dirty title and description edits first and blocks Done when edits fail', async () => {
  const timerDriver = makeManualTimerDriver();
  const { window, document } = makeMatrixWindow({ timerDriver });
  const project = { id: projectOneId, name: 'Ops', tasks: [], registers: {}, tracker: [], version: 1 };
  const initialTodo = {
    _id: todoOneId,
    projectId: projectOneId,
    title: 'Initial title',
    description: 'Initial desc',
    dueDate: '2026-10-08',
    owner: 'Owner',
    status: 'Open',
    recurrence: { type: 'weekly', interval: 1 },
  };

  let failFieldWrite = null;
  const writeLog = [];

  const transport = mockTransport((request) => {
    if (request.table === 'projects') return { data: [project], count: 1, error: null };
    if (request.table === 'manual_todos') {
      return {
        data: [{
          id: todoOneId,
          project_id: projectOneId,
          title: initialTodo.title,
          description: initialTodo.description,
          due_date: initialTodo.dueDate,
          owner_text: 'Owner',
          status: 'Open',
          recurrence: initialTodo.recurrence,
        }],
        count: 1,
        error: null,
      };
    }
    return { data: [], count: 0, error: null };
  });

  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;
  const Dialog = (await load('src/components/TodoDetailDialog.jsx')).default;

  let latestFollowUp = null;
  let root;

  function Harness() {
    const [todos, setTodos] = React.useState([initialTodo]);
    return React.createElement(TodoView, {
      todos,
      currentProject: project,
      projectData: [],
      registers: {},
      tracker: [],
      currentUserId: owner,
      currentUserName: 'Owner',
      isExternalView: false,
      onCompleteTodo: async () => ({ ok: true }),
      onUpdateTodo: async (id, field, value, original) => {
        writeLog.push({ id, field, value, originalTitle: original?.title, originalDescription: original?.description });
        if (failFieldWrite === field) return null;
        const nextUpdated = { ...original, [field]: value };
        let followUpTodo = null;
        if (field === 'status' && value === 'Done' && nextUpdated.recurrence) {
          followUpTodo = {
            ...nextUpdated,
            _id: todoTwoId,
            status: 'Open',
            dueDate: '2026-10-15',
          };
          latestFollowUp = followUpTodo;
        }
        setTodos((prev) => [
          ...prev.map((t) => (t._id === id ? nextUpdated : t)),
          ...(followUpTodo ? [followUpTodo] : []),
        ]);
        return { updatedTodo: nextUpdated, followUpTodo, confirmed: true };
      },
    });
  }

  await act(async () => {
    root = create(React.createElement(Harness));
  });

  try {
    // Open detail dialog for task.
    const titleButton = root.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.children.includes('Initial title'));
    await act(async () => {
      titleButton.props.onClick();
    });

    const dialog = () => root.root.findByType(Dialog);
    const titleInput = () => dialog().findAllByType('input').find((n) => n.props.type === 'text');
    const descArea = () => dialog().findByType('textarea');
    const statusSelect = () => dialog().findByProps({ 'aria-label': 'Task status' });

    // 1) Failed description save aborts Done and retains unsaved draft text.
    failFieldWrite = 'description';
    await act(async () => {
      descArea().props.onChange({ target: { value: 'Retained failing description' } });
    });
    await act(async () => {
      await statusSelect().props.onChange({ target: { value: 'Done' } });
    });

    assert.equal(writeLog.some((w) => w.field === 'status'), false);
    assert.equal(descArea().props.value, 'Retained failing description');
    assert.ok(
      root.root.findAllByProps({ role: 'alert' })
        .some((node) => nodeText(node).includes('did not save'))
    );

    // 2) Blank title aborts Done immediately without writing Done.
    failFieldWrite = null;
    await act(async () => {
      titleInput().props.onChange({ target: { value: '   ' } });
    });
    await act(async () => {
      await statusSelect().props.onChange({ target: { value: 'Done' } });
    });
    assert.equal(writeLog.some((w) => w.field === 'status'), false);

    // 3) Valid dirty title + dirty description flush cleanly in order BEFORE status='Done' and populate follow-up!
    writeLog.length = 0;
    await act(async () => {
      titleInput().props.onChange({ target: { value: 'Confirmed edited title' } });
      descArea().props.onChange({ target: { value: 'Confirmed edited description' } });
    });
    await act(async () => {
      await statusSelect().props.onChange({ target: { value: 'Done' } });
    });

    assert.deepEqual(
      writeLog.map((entry) => entry.field),
      ['title', 'description', 'status'],
    );
    assert.equal(writeLog[2].value, 'Done');
    assert.equal(writeLog[2].originalTitle, 'Confirmed edited title');
    assert.equal(writeLog[2].originalDescription, 'Confirmed edited description');
    assert.equal(latestFollowUp?.title, 'Confirmed edited title');
    assert.equal(latestFollowUp?.description, 'Confirmed edited description');

    // 4) Close dialog on next open recurring task, leave a failing draft before closing, then click Matrix Complete:
    // completion MUST abort without marking Done when text flush fails, then flush and succeed once restored.
    writeLog.length = 0;
    const closeDialogBtn = () => dialog().findAllByType('button').find((b) => b.children.includes('Close'));
    await act(async () => {
      closeDialogBtn().props.onClick();
    });

    const nextOpenTitleBtn = root.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.children.includes('Confirmed edited title'));
    await act(async () => {
      nextOpenTitleBtn.props.onClick();
    });
    failFieldWrite = 'description';
    await act(async () => {
      descArea().props.onChange({ target: { value: 'Failed before matrix complete' } });
    });
    await act(async () => {
      closeDialogBtn().props.onClick();
      await flushMicrotasks();
    });

    const matrixCompleteBtn = () => root.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.props['aria-label'] === 'Complete Confirmed edited title');
    await act(async () => {
      matrixCompleteBtn().props.onClick();
      await flushMicrotasks();
    });
    await act(async () => {
      await timerDriver.runAll();
    });
    assert.equal(writeLog.some((w) => w.field === 'status'), false);
    assert.ok(matrixCompleteBtn());

    failFieldWrite = null;
    writeLog.length = 0;
    await act(async () => {
      matrixCompleteBtn().props.onClick();
      await flushMicrotasks();
    });
    await act(async () => {
      await timerDriver.runAll();
    });
    assert.deepEqual(
      writeLog.map((entry) => entry.field),
      ['description', 'status'],
    );
    assert.equal(writeLog[1].originalDescription, 'Failed before matrix complete');
  } finally {
    await act(async () => root.unmount());
  }
});

test('switching scope to This Project + Other during Undo window still routes completion to the task source project', async () => {
  const timerDriver = makeManualTimerDriver();
  const { window, document } = makeMatrixWindow({ timerDriver });
  const currentProject = {
    id: projectOneId,
    name: 'Alpha',
    version: 1,
    tasks: [{ id: 1, name: 'Alpha task 1', start: '2026-10-08', dur: 1, pct: 0, indent: 0, tracked: true }],
    registers: {},
    tracker: [],
  };
  let remoteProject = {
    id: projectTwoId,
    name: 'Beta',
    version: 1,
    tasks: [{ id: 1, name: 'Beta task 1', start: '2026-10-08', dur: 1, pct: 0, indent: 0, tracked: true }],
    registers: {},
    tracker: [],
  };
  const projectUpdates = [];
  const completeTodoCalls = [];

  const transport = mockTransport((request) => {
    if (request.table === 'projects' && request.operation === 'select') {
      return { data: [structuredClone(currentProject), structuredClone(remoteProject)], count: 2, error: null };
    }
    if (request.table === 'projects' && request.operation === 'update') {
      const targetId = request.filters.find((f) => f.args[0] === 'id')?.args?.[1];
      projectUpdates.push({ targetId, tasks: request.payload.tasks });
      remoteProject = { ...remoteProject, ...request.payload, version: remoteProject.version + 1 };
      return { data: { version: remoteProject.version }, error: null };
    }
    return { data: [], count: 0, error: null };
  });

  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;
  const { useProjectData } = await load('src/hooks/useProjectData.js');

  let root;
  await act(async () => {
    root = create(React.createElement(TodoView, {
      todos: [],
      currentProject,
      projectData: currentProject.tasks,
      registers: currentProject.registers,
      tracker: currentProject.tracker,
      currentUserId: owner,
      currentUserName: 'Owner',
      isExternalView: false,
      onCompleteTodo: async (todo) => {
        completeTodoCalls.push(todo);
        return { ok: true };
      },
    }));
  });

  try {
    const betaCompleteBtn = root.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.props['aria-label'] === 'Complete Beta task 1');
    assert.ok(betaCompleteBtn);
    await act(async () => {
      betaCompleteBtn.props.onClick();
    });

    // Switch scope to "This Project + Other" BEFORE Undo timer fires.
    const scopeSelect = root.root.findByProps({ 'aria-label': 'Task scope' });
    await act(async () => {
      scopeSelect.props.onChange({ target: { value: 'project' } });
    });

    await act(async () => {
      await timerDriver.runAll();
    });

    assert.equal(completeTodoCalls.length, 0);
    assert.equal(projectUpdates.length, 1);
    assert.equal(projectUpdates[0].targetId, projectTwoId);
    assert.equal(projectUpdates[0].tasks[0].pct, 100);
    assert.equal(currentProject.tasks[0].pct, 0);

    // Defense-in-depth inside useProjectData.completeTodoFromView refuses cross-project schedule mutations.
    const dataHook = await mountHook(
      ({ id, user }) => useProjectData(id, user),
      { id: projectOneId, user: owner },
    );
    try {
      let mismatchedResult;
      await act(async () => {
        mismatchedResult = await dataHook.value.completeTodoFromView({
          _id: 'schedule_1',
          isDerived: true,
          projectId: projectTwoId,
          originType: 'schedule',
          originTaskId: 1,
          title: 'Beta task 1',
        });
      });
      assert.equal(mismatchedResult.ok, false);
    } finally {
      await dataHook.close();
    }
  } finally {
    await act(async () => root.unmount());
  }
});

test('atomic recurring RPC saves parent and follow-up in one call, computes date from locked row, and rejects unlinked collisions', async () => {
  const { window, document } = makeMatrixWindow();
  let failRpc = false;
  let omitFollowUpLink = false;

  const recurringParent = {
    _id: todoOneId,
    projectId: projectOneId,
    title: 'Monthly audit',
    description: 'Check invoices',
    dueDate: '2026-10-08',
    owner: 'Owner',
    assigneeUserId: owner,
    status: 'Open',
    recurrence: { type: 'monthly', interval: 1 },
  };

  const load = await sourceModules(mockTransport(() => ({ data: [] })), {
    window,
    document,
    navigator: { onLine: true },
  });
  const { deriveRecurringFollowUpId, ensureRecurringManualTodoFollowUp } = await load('src/hooks/projectData/recurringFollowUp.js');
  const expectedFollowUpId = deriveRecurringFollowUpId(todoOneId);

  const transport = mockTransport((request) => {
    if (request.operation === 'rpc' && request.name === 'complete_recurring_manual_todo_v1') {
      if (failRpc) {
        return { data: null, error: { code: '42501', message: 'Row-level security denied' } };
      }
      return {
        data: {
          updated_todo: {
            id: todoOneId,
            user_id: owner,
            project_id: projectOneId,
            title: recurringParent.title,
            description: recurringParent.description,
            due_date: recurringParent.dueDate,
            owner_text: recurringParent.owner,
            assignee_user_id: owner,
            status: 'Done',
            recurrence: recurringParent.recurrence,
            completed_at: '2026-10-08T12:00:00Z',
          },
          follow_up_todo: {
            id: request.payload.p_follow_up_id,
            user_id: owner,
            project_id: projectOneId,
            title: recurringParent.title,
            description: recurringParent.description,
            due_date: '2026-11-08',
            owner_text: recurringParent.owner,
            assignee_user_id: owner,
            status: 'Open',
            recurrence: recurringParent.recurrence,
            recurrence_source_todo_id: omitFollowUpLink ? null : todoOneId,
            meta: omitFollowUpLink ? {} : { recurrenceSourceTodoId: todoOneId },
            completed_at: null,
          },
        },
        error: null,
      };
    }
    return { data: [], count: 0, error: null };
  });

  const loadAtomic = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const { useProjectTodos } = await loadAtomic('src/hooks/projectData/useProjectTodos.js');
  const hook = await mountHook(useProjectTodos, {
    userId: owner,
    projectId: projectOneId,
    isOnline: true,
    now: () => '2026-10-08T12:00:00Z',
    setLastSaved() {},
    setOfflinePendingSync() {},
    setUsingOfflineSnapshot() {},
  });

  try {
    let result;
    await act(async () => {
      result = await hook.value.updateTodo(todoOneId, 'status', 'Done', recurringParent);
    });
    assert.equal(result?.confirmed, true);
    assert.equal(result?.atomic, true);
    assert.equal(result?.updatedTodo?.status, 'Done');
    assert.equal(result?.followUpTodo?._id, expectedFollowUpId);
    assert.equal(result?.followUpTodo?.dueDate, '2026-11-08');

    const rpcCalls = transport.calls.filter((c) => c.operation === 'rpc');
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].payload.p_follow_up_id, expectedFollowUpId);
    assert.equal(typeof rpcCalls[0].payload.p_fallback_date, 'string');
    assert.equal('p_next_due_date' in rpcCalls[0].payload, false);
    assert.equal(
      transport.calls.some((c) => c.table === 'manual_todos' && ['update', 'insert'].includes(c.operation)),
      false
    );
    assert.equal(hook.value.todos.filter((t) => t._id === expectedFollowUpId && t.status === 'Open').length, 1);

    omitFollowUpLink = true;
    let unlinkedRpcResult;
    await act(async () => {
      unlinkedRpcResult = await hook.value.updateTodo(todoOneId, 'status', 'Done', recurringParent);
    });
    assert.equal(unlinkedRpcResult, null);
    omitFollowUpLink = false;

    failRpc = true;
    const beforeFailureCalls = transport.calls.length;
    let deniedResult;
    await act(async () => {
      deniedResult = await hook.value.updateTodo(todoOneId, 'status', 'Done', recurringParent);
    });
    assert.equal(deniedResult, null);
    assert.equal(
      transport.calls.slice(beforeFailureCalls).some((c) => c.table === 'manual_todos'),
      false
    );

    // Pre-migration reconcile must never confirm an unrelated row that merely shares followUpId without a verified link.
    const unlinkedCollisionRow = {
      id: expectedFollowUpId,
      user_id: owner,
      project_id: projectOneId,
      title: 'Unrelated pre-existing row',
      due_date: '2026-12-25',
      owner_text: 'Owner',
      assignee_user_id: owner,
      status: 'Open',
      recurrence: { type: 'monthly', interval: 1 },
      recurrence_source_todo_id: null,
      meta: {},
      completed_at: null,
    };
    const collisionTransport = mockTransport((request) => {
      if (request.table === 'manual_todos' && request.operation === 'select') {
        return { data: unlinkedCollisionRow, error: null };
      }
      if (request.table === 'manual_todos' && request.operation === 'insert') {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      }
      return { data: null, error: null };
    });
    const collisionResult = await ensureRecurringManualTodoFollowUp({
      client: collisionTransport,
      userId: owner,
      followUpId: expectedFollowUpId,
      sourceTodo: recurringParent,
      normalizedRecurrence: recurringParent.recurrence,
      nextRecurringDueDate: '2026-11-08',
      nowIso: '2026-10-08T12:00:00Z',
      supportsExtendedFields: true,
    });
    assert.equal(collisionResult.ok, false);
    assert.equal(collisionResult.followUpTodo ?? null, null);
  } finally {
    await hook.close();
  }
});

test('signing out and back into the same account mid-hook recurring save stops subsequent reconcile and insert writes', async () => {
  const { window, document } = makeMatrixWindow();
  let holdUpdate = false;
  let updateGate = null;
  let reconcileGate = null;

  const recurringParent = {
    _id: todoOneId,
    projectId: projectOneId,
    title: 'Sign-out guard hook',
    description: 'Notes',
    dueDate: '2026-10-08',
    owner: 'Owner',
    assigneeUserId: owner,
    status: 'Open',
    recurrence: { type: 'weekly', interval: 1 },
  };

  const transport = mockTransport(async (request) => {
    if (request.operation === 'rpc' && request.name === 'complete_recurring_manual_todo_v1') {
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.complete_recurring_manual_todo_v1' } };
    }
    if (request.table === 'manual_todos' && request.operation === 'update') {
      if (holdUpdate && updateGate) await updateGate.promise;
      return {
        data: {
          id: todoOneId,
          user_id: owner,
          project_id: projectOneId,
          title: recurringParent.title,
          description: recurringParent.description,
          due_date: recurringParent.dueDate,
          owner_text: recurringParent.owner,
          assignee_user_id: owner,
          status: 'Done',
          recurrence: recurringParent.recurrence,
          completed_at: '2026-10-08T12:00:00Z',
        },
        error: null,
      };
    }
    if (request.table === 'manual_todos' && request.operation === 'select') {
      if (reconcileGate) await reconcileGate.promise;
      return { data: null, error: null };
    }
    return { data: [], count: 0, error: null };
  });

  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const { useProjectTodos } = await load('src/hooks/projectData/useProjectTodos.js');
  const { createTaskCompletionSession } = await load('src/utils/taskCompletionSession.js');
  const session = createTaskCompletionSession({ initialUserId: owner, storage: window.localStorage });

  const hook = await mountHook(useProjectTodos, {
    completionSession: session,
    userId: owner,
    projectId: projectOneId,
    isOnline: true,
    now: () => '2026-10-08T12:00:00Z',
    setLastSaved() {},
    setOfflinePendingSync() {},
    setUsingOfflineSnapshot() {},
  });

  try {
    // 1) Hold awaited reconcile read inside ensureRecurringManualTodoFollowUp -> A -> signed out -> A -> 0 inserts.
    reconcileGate = deferred();
    let pendingFirst;
    await act(async () => {
      pendingFirst = hook.value.updateTodo(todoOneId, 'status', 'Done', recurringParent);
      await flushMicrotasks();
    });
    assert.equal(transport.calls.filter((c) => c.table === 'manual_todos' && c.operation === 'select').length, 1);

    session.revoke({ clearPersisted: true });
    session.setOwner(owner);

    let firstResult;
    await act(async () => {
      reconcileGate.resolve();
      firstResult = await pendingFirst;
    });
    assert.equal(firstResult, null);
    assert.equal(transport.calls.filter((c) => c.table === 'manual_todos' && c.operation === 'insert').length, 0);
    assert.equal(hook.value.todos.length, 0);

    // 2) Hold initial UPDATE -> A -> signed out -> A -> 0 reconcile select or insert calls.
    const callsBeforeSecond = transport.calls.length;
    holdUpdate = true;
    reconcileGate = null;
    updateGate = deferred();
    let pendingSecond;
    await act(async () => {
      pendingSecond = hook.value.updateTodo(todoOneId, 'status', 'Done', recurringParent);
      await flushMicrotasks();
    });

    session.revoke({ clearPersisted: true });
    session.setOwner(owner);

    let secondResult;
    await act(async () => {
      updateGate.resolve();
      secondResult = await pendingSecond;
    });
    assert.equal(secondResult, null);
    const secondCalls = transport.calls.slice(callsBeforeSecond);
    assert.equal(secondCalls.some((c) => c.table === 'manual_todos' && ['select', 'insert'].includes(c.operation)), false);
  } finally {
    await hook.close();
    session.dispose();
  }
});

test('overlapping full priority reload stays full and Refresh tasks reloads cached checklists', async () => {
  const { window, document } = makeMatrixWindow();
  const todoA = { _id: todoOneId, projectId: projectOneId, title: 'Task A', dueDate: '2026-10-08', status: 'Open' };
  const todoB = { _id: todoTwoId, projectId: projectOneId, title: 'Task B', dueDate: '2026-10-09', status: 'Open' };
  const todoC = { _id: todoThreeId, projectId: projectOneId, title: 'Task C', dueDate: '2026-10-10', status: 'Open' };

  const prefRows = {
    [`manual:${todoOneId}`]: { id: 'p-1', user_id: owner, task_key: `manual:${todoOneId}`, manual_quadrant: 'urgent_important', version: 1 },
    [`manual:${todoTwoId}`]: { id: 'p-2', user_id: owner, task_key: `manual:${todoTwoId}`, manual_quadrant: 'not_urgent_important', version: 1 },
    [`manual:${todoThreeId}`]: { id: 'p-3', user_id: owner, task_key: `manual:${todoThreeId}`, manual_quadrant: 'urgent_not_important', version: 1 },
  };
  let reloadGate = null;
  let holdNextReload = false;

  const prefTransport = mockTransport(async (request) => {
    if (request.table === 'task_eisenhower_preferences' && request.operation === 'select') {
      if (holdNextReload) {
        holdNextReload = false;
        reloadGate = deferred();
        await reloadGate.promise;
      }
      const requested = request.filters.find((f) => f.method === 'in')?.args?.[1] || [];
      const rows = requested.map((k) => structuredClone(prefRows[k])).filter(Boolean);
      return { data: rows, count: rows.length, error: null };
    }
    return { data: [], count: 0, error: null };
  });

  const loadMatrix = await sourceModules(prefTransport, { window, document, navigator: { onLine: true } });
  const { useTodoEisenhowerMatrix } = await loadMatrix('src/hooks/useTodoEisenhowerMatrix.js');
  const matrixHook = await mountHook(useTodoEisenhowerMatrix, {
    currentUserId: owner,
    isExternalView: false,
    enabled: true,
    todos: [todoA, todoB],
    today: '2026-10-08',
  });

  try {
    assert.equal(matrixHook.value.preferences[`manual:${todoOneId}`].manual_quadrant, 'urgent_important');

    // Remote priority changes, then reload() is overlapped by a new task triggering background delta effect.
    prefRows[`manual:${todoOneId}`] = {
      ...prefRows[`manual:${todoOneId}`],
      manual_quadrant: 'not_urgent_not_important',
      version: 2,
    };
    holdNextReload = true;
    let reloadPromise;
    await act(async () => {
      reloadPromise = matrixHook.value.reload();
      await flushMicrotasks();
    });

    await matrixHook.update({
      currentUserId: owner,
      isExternalView: false,
      enabled: true,
      todos: [todoA, todoB, todoC],
      today: '2026-10-08',
    });

    await act(async () => {
      reloadGate.resolve();
      await reloadPromise;
      await flushMicrotasks();
    });

    const latestSelectKeys = prefTransport.calls.filter((c) => c.table === 'task_eisenhower_preferences').at(-1)
      .filters.find((f) => f.method === 'in').args[1];
    assert.deepEqual(latestSelectKeys, [`manual:${todoOneId}`, `manual:${todoTwoId}`, `manual:${todoThreeId}`].sort());
    assert.equal(matrixHook.value.preferences[`manual:${todoOneId}`].manual_quadrant, 'not_urgent_not_important');
    assert.equal(matrixHook.value.preferences[`manual:${todoOneId}`].version, 2);
    assert.equal(matrixHook.value.isKeyCovered(`manual:${todoThreeId}`), true);
  } finally {
    await matrixHook.close();
  }

  // Part B: Refresh tasks in TodoView triggers full checklist reload (even across cached cards + overlapping new card).
  let checklistTitle = 'Initial checklist';
  let checklistRows = [
    { id: 'chk-1', user_id: owner, project_id: projectOneId, card_key: `manual:${todoOneId}`, title: checklistTitle, position: 0 },
  ];
  let includeSecondTodoInDb = false;

  const refreshTransport = mockTransport((request) => {
    if (request.table === 'projects') {
      return { data: [{ id: projectOneId, name: 'Ops', tasks: [], registers: {}, tracker: [], version: 1 }], count: 1, error: null };
    }
    if (request.table === 'manual_todos' && request.operation === 'select') {
      const list = [
        { id: todoOneId, project_id: projectOneId, title: 'Task A', due_date: '2026-10-08', status: 'Open' },
        ...(includeSecondTodoInDb
          ? [{ id: todoTwoId, project_id: projectOneId, title: 'Task B', due_date: '2026-10-08', status: 'Open' }]
          : []),
      ];
      return { data: list, count: list.length, error: null };
    }
    if (request.table === 'task_card_checklists') {
      const cardKeys = request.filters.find((f) => f.method === 'in' && f.args[0] === 'card_key')?.args?.[1] || [];
      return {
        data: checklistRows
          .filter((row) => cardKeys.includes(row.card_key))
          .map((row) => ({ ...row, title: checklistTitle })),
        error: null,
      };
    }
    if (request.table === 'task_card_checklist_items') {
      return { data: [], error: null };
    }
    if (request.table === 'task_eisenhower_preferences') {
      return { data: [], count: 0, error: null };
    }
    return { data: [], count: 0, error: null };
  });

  const loadView = await sourceModules(refreshTransport, { window, document, navigator: { onLine: true } });
  const TodoView = (await loadView('src/components/TodoView.jsx')).default;
  const Dialog = (await loadView('src/components/TodoDetailDialog.jsx')).default;
  const Matrix = (await loadView('src/components/TodoEisenhowerMatrix.jsx')).default;

  let viewRoot;
  await act(async () => {
    viewRoot = create(React.createElement(TodoView, {
      todos: [{ _id: todoOneId, projectId: projectOneId, title: 'Task A', dueDate: '2026-10-08', status: 'Open' }],
      currentProject: { id: projectOneId, name: 'Ops', tasks: [], registers: {}, tracker: [], version: 1 },
      projectData: [],
      registers: {},
      tracker: [],
      currentUserId: owner,
      currentUserName: 'Owner',
      isExternalView: false,
      onCompleteTodo: async () => ({ ok: true }),
    }));
  });

  try {
    const callsBeforeRefresh = refreshTransport.calls.length;
    checklistTitle = 'Refreshed checklist';
    includeSecondTodoInDb = true;

    const refreshBtn = viewRoot.root.findByProps({ 'aria-label': 'Refresh tasks' });
    await act(async () => {
      refreshBtn.props.onClick();
      await flushMicrotasks();
    });

    const checklistCallsAfterRefresh = refreshTransport.calls
      .slice(callsBeforeRefresh)
      .filter((c) => c.table === 'task_card_checklists');
    assert.ok(checklistCallsAfterRefresh.length >= 1);
    assert.ok(
      checklistCallsAfterRefresh.some((c) =>
        c.filters.find((f) => f.args[0] === 'card_key')?.args?.[1]?.includes(`manual:${todoOneId}`)
      )
    );

    const openTaskAButton = viewRoot.root.findByType(Matrix).findAllByType('button')
      .find((b) => b.children.includes('Task A'));
    await act(async () => {
      openTaskAButton.props.onClick();
    });
    assert.ok(viewRoot.root.findAllByType(Dialog).length === 1);
    assert.ok(JSON.stringify(viewRoot.toJSON()).includes('Refreshed checklist'));
  } finally {
    await act(async () => viewRoot.unmount());
  }
});

test('saved recurring recovery retries route through complete_recurring_manual_todo_v1 once migration is installed and handle cleared recurrence', async () => {
  const timerDriver = makeManualTimerDriver();
  const { window, document } = makeMatrixWindow({ timerDriver });
  const seedLoader = await sourceModules(mockTransport(() => ({ data: [] })), {
    window,
    document,
    navigator: { onLine: true },
  });
  const { deriveRecurringFollowUpId } = await seedLoader('src/hooks/projectData/recurringFollowUp.js');
  const { createTaskCompletionSession } = await seedLoader('src/utils/taskCompletionSession.js');
  const expectedFollowUpId = deriveRecurringFollowUpId(todoOneId);

  const preMigrationSession = createTaskCompletionSession({
    initialUserId: owner,
    storage: window.localStorage,
  });
  preMigrationSession.recordRecurringRecovery({
    id: expectedFollowUpId,
    parentTodoId: todoOneId,
    userId: owner,
    sourceTodo: {
      _id: todoOneId,
      projectId: projectOneId,
      title: 'Weekly payroll',
      dueDate: '2026-10-08',
      recurrence: { type: 'weekly', interval: 1 },
    },
    normalizedRecurrence: { type: 'weekly', interval: 1 },
    nextRecurringDueDate: '2026-10-15',
    fallbackDate: '2026-10-08',
    completedAt: '2026-10-08T12:00:00Z',
    title: 'Weekly payroll',
  });
  preMigrationSession.dispose();

  const persistedBeforeReload = JSON.parse(
    window.localStorage.getItem(`pmworkspace:recurring-recovery:v1:${owner}`) || '[]'
  );
  assert.equal(persistedBeforeReload.length, 1);
  assert.equal(persistedBeforeReload[0].fallbackDate, '2026-10-08');
  assert.equal(persistedBeforeReload[0].completedAt, '2026-10-08T12:00:00Z');

  let rpcOutcome = 'non-missing-error';
  const transport = mockTransport((request) => {
    if (request.operation === 'rpc' && request.name === 'complete_recurring_manual_todo_v1') {
      if (rpcOutcome === 'non-missing-error') {
        return { data: null, error: { code: '42501', message: 'Temporary RLS denial' } };
      }
      if (rpcOutcome === 'cleared-recurrence') {
        return {
          data: {
            updated_todo: {
              id: todoTwoId,
              user_id: owner,
              project_id: projectOneId,
              title: 'Cancelled series',
              due_date: '2026-10-10',
              status: 'Done',
              recurrence: null,
              completed_at: '2026-10-08T12:00:00Z',
            },
            follow_up_todo: null,
          },
          error: null,
        };
      }
      return {
        data: {
          updated_todo: {
            id: todoOneId,
            user_id: owner,
            project_id: projectOneId,
            title: 'Weekly payroll',
            due_date: '2026-10-20',
            status: 'Done',
            recurrence: { type: 'weekly', interval: 2 },
            completed_at: '2026-10-08T12:00:00Z',
          },
          follow_up_todo: {
            id: request.payload.p_follow_up_id,
            user_id: owner,
            project_id: projectOneId,
            title: 'Weekly payroll',
            due_date: '2026-11-03',
            status: 'Open',
            recurrence: { type: 'weekly', interval: 2 },
            recurrence_source_todo_id: todoOneId,
            meta: { recurrenceSourceTodoId: todoOneId },
            completed_at: null,
          },
        },
        error: null,
      };
    }
    if (request.table === 'manual_todos' && request.operation === 'select') {
      return {
        data: [
          {
            id: todoOneId,
            user_id: owner,
            project_id: projectOneId,
            title: 'Weekly payroll',
            due_date: '2026-10-08',
            status: 'Done',
            recurrence: { type: 'weekly', interval: 1 },
            completed_at: '2026-10-08T12:00:00Z',
          },
          {
            id: todoTwoId,
            user_id: owner,
            project_id: projectOneId,
            title: 'Cancelled series',
            due_date: '2026-10-10',
            status: 'Done',
            recurrence: { type: 'weekly', interval: 1 },
            completed_at: '2026-10-08T12:00:00Z',
          },
        ],
        count: 2,
        error: null,
      };
    }
    return { data: [], count: 0, error: null };
  });

  const postMigrationLoader = await sourceModules(transport, {
    window,
    document,
    navigator: { onLine: true },
  });
  const postSessionMod = await postMigrationLoader('src/utils/taskCompletionSession.js');
  const TaskCompletionSessionOverlay = (await postMigrationLoader('src/components/TaskCompletionSessionOverlay.jsx')).default;
  const { useProjectTodos } = await postMigrationLoader('src/hooks/projectData/useProjectTodos.js');

  const reloadedSession = postSessionMod.createTaskCompletionSession({
    initialUserId: owner,
    storage: window.localStorage,
    setTimer: (fn, delay) => timerDriver.setTimeout(fn, delay),
    clearTimer: (id) => timerDriver.clearTimeout(id),
  });

  let overlayRoot = null;
  let hook = null;
  try {
    await act(async () => {
      overlayRoot = create(React.createElement(TaskCompletionSessionOverlay, {
        session: reloadedSession,
        userId: owner,
      }));
    });

    const retryBtn = overlayRoot.root.findAllByType('button')
      .find((b) => b.children.includes('Retry next occurrence'));
    assert.ok(retryBtn);

    // Non-missing RPC failure must not fall back to direct manual_todos writes and keeps recovery persisted.
    await act(async () => {
      await retryBtn.props.onClick();
    });
    const firstRpc = transport.calls.filter((c) => c.operation === 'rpc');
    assert.equal(firstRpc.length, 1);
    assert.equal(firstRpc[0].name, 'complete_recurring_manual_todo_v1');
    assert.equal(firstRpc[0].payload.p_todo_id, todoOneId);
    assert.equal(firstRpc[0].payload.p_fallback_date, '2026-10-08');
    assert.equal(firstRpc[0].payload.p_completed_at, '2026-10-08T12:00:00Z');
    assert.equal(
      transport.calls.some((c) => c.table === 'manual_todos' && ['update', 'insert', 'select'].includes(c.operation)),
      false
    );
    assert.ok(window.localStorage.getItem(`pmworkspace:recurring-recovery:v1:${owner}`));

    // Succeeds through RPC and clears persisted recovery cleanly.
    rpcOutcome = 'ok';
    await act(async () => {
      await overlayRoot.root.findAllByType('button')
        .find((b) => b.children.includes('Retry next occurrence'))
        .props.onClick();
    });
    assert.equal(transport.calls.filter((c) => c.operation === 'rpc').length, 2);
    assert.equal(
      transport.calls.some((c) => c.table === 'manual_todos' && ['update', 'insert'].includes(c.operation)),
      false
    );
    assert.equal(window.localStorage.getItem(`pmworkspace:recurring-recovery:v1:${owner}`), null);
    assert.equal(
      overlayRoot.root.findAllByType('button').some((b) => b.children.includes('Retry next occurrence')),
      false
    );

    await act(async () => {
      overlayRoot.unmount();
    });
    overlayRoot = null;

    // Also verify useProjectTodos.retryRecurringFollowUp updates parent + followUp from server and accepts follow_up_todo: null when recurrence was cleared remotely.
    hook = await mountHook(useProjectTodos, {
      userId: owner,
      projectId: projectOneId,
      isOnline: true,
      completionSession: reloadedSession,
      now: () => '2026-10-08T12:00:00Z',
      setLastSaved() {},
      setOfflinePendingSync() {},
      setUsingOfflineSnapshot() {},
    });
    await act(async () => {
      await hook.value.loadTodos();
      await flushMicrotasks();
    });

    let hookRetryRes;
    await act(async () => {
      hookRetryRes = await hook.value.retryRecurringFollowUp({
        id: expectedFollowUpId,
        parentTodoId: todoOneId,
        userId: owner,
        sourceTodo: { _id: todoOneId, projectId: projectOneId, title: 'Weekly payroll' },
        normalizedRecurrence: { type: 'weekly', interval: 1 },
        nextRecurringDueDate: '2026-10-15',
        fallbackDate: '2026-10-08',
        completedAt: '2026-10-08T12:00:00Z',
      });
    });
    assert.equal(hookRetryRes.ok, true);
    assert.equal(hookRetryRes.updatedTodo?.dueDate, '2026-10-20');
    assert.equal(hookRetryRes.followUpTodo?.dueDate, '2026-11-03');
    assert.equal(hook.value.todos.find((t) => t._id === expectedFollowUpId)?.dueDate, '2026-11-03');

    rpcOutcome = 'cleared-recurrence';
    let clearedRes;
    await act(async () => {
      clearedRes = await hook.value.retryRecurringFollowUp({
        id: deriveRecurringFollowUpId(todoTwoId),
        parentTodoId: todoTwoId,
        userId: owner,
        sourceTodo: { _id: todoTwoId, projectId: projectOneId, title: 'Cancelled series' },
        normalizedRecurrence: { type: 'weekly', interval: 1 },
        nextRecurringDueDate: '2026-10-17',
        fallbackDate: '2026-10-10',
        completedAt: '2026-10-08T12:00:00Z',
      });
    });
    assert.equal(clearedRes.ok, true);
    assert.equal(clearedRes.followUpTodo, null);
    assert.equal(clearedRes.updatedTodo?.recurrence, null);
    assert.equal(hook.value.todos.find((t) => t._id === todoTwoId)?.recurrence, null);
    assert.equal(hook.value.todos.filter((t) => t.status === 'Open').length, 1);
  } finally {
    if (hook) await hook.close();
    if (overlayRoot) await act(async () => overlayRoot.unmount());
    reloadedSession.dispose();
  }
});

test('offline recurring completion and edits route through complete_recurring_manual_todo_v1 on reconnect without bypassing recurrence link', async () => {
  const timerDriver = makeManualTimerDriver();
  const { window, document } = makeMatrixWindow({ timerDriver });

  const transport = mockTransport((request) => {
    if (request.operation === 'rpc' && request.name === 'complete_recurring_manual_todo_v1') {
      const parentId = request.payload.p_todo_id;
      const followUpId = request.payload.p_follow_up_id;
      return {
        data: {
          updated_todo: {
            id: parentId,
            user_id: owner,
            project_id: projectOneId,
            title: 'Monthly sync check',
            due_date: '2026-10-20',
            owner_text: 'Owner',
            assignee_user_id: owner,
            status: 'Done',
            recurrence: { type: 'monthly', interval: 1 },
            completed_at: request.payload.p_completed_at || '2026-10-08T12:00:00Z',
          },
          follow_up_todo: {
            id: followUpId,
            user_id: owner,
            project_id: projectOneId,
            title: 'Monthly sync check',
            due_date: '2026-11-20',
            owner_text: 'Owner',
            assignee_user_id: owner,
            status: 'Open',
            recurrence: { type: 'monthly', interval: 1 },
            recurrence_source_todo_id: parentId,
            meta: { recurrenceSourceTodoId: parentId },
            completed_at: null,
          },
        },
        error: null,
      };
    }
    if (request.table === 'manual_todos' && request.operation === 'select') {
      return {
        data: [
          {
            id: todoOneId,
            user_id: owner,
            project_id: projectOneId,
            title: 'Monthly sync check',
            due_date: '2026-10-08',
            owner_text: 'Owner',
            assignee_user_id: owner,
            status: 'Open',
            recurrence: { type: 'monthly', interval: 1 },
            completed_at: null,
          },
        ],
        count: 1,
        error: null,
      };
    }
    if (request.table === 'manual_todos' && request.operation === 'insert') {
      return {
        data: {
          ...request.payload,
          id: request.payload.id || todoThreeId,
          created_at: '2026-10-08T12:00:00Z',
          updated_at: '2026-10-08T12:00:00Z',
        },
        error: null,
      };
    }
    if (request.table === 'manual_todos' && request.operation === 'update') {
      const targetId = request.filters.find((f) => f.args[0] === 'id')?.args?.[1];
      return {
        data: {
          id: targetId,
          user_id: owner,
          project_id: projectOneId,
          title: request.payload.title || 'Monthly sync check',
          due_date: '2026-11-20',
          owner_text: 'Owner',
          assignee_user_id: owner,
          status: 'Open',
          recurrence: { type: 'monthly', interval: 1 },
          recurrence_source_todo_id: todoOneId,
          meta: { recurrenceSourceTodoId: todoOneId },
          completed_at: null,
        },
        error: null,
      };
    }
    return { data: [], count: 0, error: null };
  });

  const loader = await sourceModules(transport, {
    window,
    document,
    navigator: { onLine: true },
  });
  const offlineQueueMod = await loader('src/utils/offlineQueue.js');
  const { deriveRecurringFollowUpId, isValidRecurringUuid } = await loader('src/hooks/projectData/recurringFollowUp.js');
  const { useProjectTodos } = await loader('src/hooks/projectData/useProjectTodos.js');

  // Verify queue state transitions for follow-up deletion vs offline-created parent deletion (including chained follow-ups).
  let q = [];
  q = offlineQueueMod.enqueueCreate(q, { localId: 'offline-todo-parent-1', title: 'Draft' });
  q = offlineQueueMod.enqueueRecurringComplete(q, {
    targetId: 'offline-todo-parent-1',
    followUpLocalId: 'offline-todo-follow-1',
    patch: { status: 'Done' },
    completedAt: '2026-10-08T12:00:00Z',
    fallbackDate: '2026-10-08',
    sourceTodo: { _id: 'offline-todo-parent-1', title: 'Draft' },
    normalizedRecurrence: { type: 'weekly', interval: 1 },
    nextRecurringDueDate: '2026-10-15',
  });
  q = offlineQueueMod.enqueueUpdate(q, 'offline-todo-follow-1', { title: 'Renamed follow-up' });
  q = offlineQueueMod.enqueueRecurringComplete(q, {
    targetId: 'offline-todo-follow-1',
    followUpLocalId: 'offline-todo-follow-2',
    patch: { status: 'Done' },
    completedAt: '2026-10-08T12:05:00Z',
    fallbackDate: '2026-10-15',
    sourceTodo: { _id: 'offline-todo-follow-1', title: 'Renamed follow-up' },
    normalizedRecurrence: { type: 'weekly', interval: 1 },
    nextRecurringDueDate: '2026-10-22',
  });

  const expectedServerFollowUpId = deriveRecurringFollowUpId(todoOneId);
  const afterFollowUpDelete = offlineQueueMod.enqueueDelete(q, 'offline-todo-follow-1');
  assert.equal(afterFollowUpDelete.some((op) => op.kind === 'update' && op.targetId === 'offline-todo-follow-1'), false);
  assert.equal(afterFollowUpDelete.some((op) => op.kind === 'complete-recurring' && op.targetId === 'offline-todo-follow-1'), false);
  assert.equal(afterFollowUpDelete.some((op) => op.targetId === 'offline-todo-follow-2'), false);
  assert.equal(afterFollowUpDelete.some((op) => op.kind === 'complete-recurring' && op.targetId === 'offline-todo-parent-1'), true);
  assert.equal(afterFollowUpDelete.some((op) => op.kind === 'delete' && op.targetId === 'offline-todo-follow-1'), true);
  const remappedDelete = offlineQueueMod.replaceQueuedTargetId(afterFollowUpDelete, 'offline-todo-follow-1', expectedServerFollowUpId);
  assert.equal(remappedDelete.some((op) => op.kind === 'delete' && op.targetId === expectedServerFollowUpId), true);
  const afterParentDelete = offlineQueueMod.enqueueDelete(q, 'offline-todo-parent-1');
  assert.equal(afterParentDelete.length, 0);
  const baseProps = {
    userId: owner,
    projectId: projectOneId,
    isOnline: true,
    now: () => '2026-10-08T12:00:00Z',
    setLastSaved() {},
    setOfflinePendingSync() {},
    setUsingOfflineSnapshot() {},
  };

  const hook = await mountHook(useProjectTodos, baseProps);
  try {
    await act(async () => {
      await hook.value.loadTodos();
      await flushMicrotasks();
    });
    assert.equal(hook.value.todos.length, 1);

    // Go offline, complete the recurring task, and immediately edit its optimistic follow-up title.
    await hook.update({ ...baseProps, isOnline: false });
    const onlineCallsBeforeOfflineWork = transport.calls.length;

    let offlineCompleteResult;
    const sourceTodo = hook.value.todos[0];
    await act(async () => {
      offlineCompleteResult = await hook.value.updateTodo(todoOneId, 'status', 'Done', sourceTodo);
    });
    const localFollowUp = offlineCompleteResult?.followUpTodo;
    assert.ok(localFollowUp?._id);

    await act(async () => {
      await hook.value.updateTodo(localFollowUp._id, 'title', 'Edited follow-up title', localFollowUp);
    });

    assert.equal(transport.calls.length, onlineCallsBeforeOfflineWork);
    assert.equal(hook.value.todos.find((t) => t._id === todoOneId)?.status, 'Done');
    assert.equal(hook.value.todos.find((t) => t._id === localFollowUp._id)?.title, 'Edited follow-up title');

    // Reconnect and verify sync replays through complete_recurring_manual_todo_v1 before patching the server follow-up UUID.
    await hook.update({ ...baseProps, isOnline: true });
    await act(async () => {
      await flushMicrotasks(24);
    });

    const rpcCalls = transport.calls.filter((c) => c.operation === 'rpc');
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].name, 'complete_recurring_manual_todo_v1');
    assert.equal(rpcCalls[0].payload.p_todo_id, todoOneId);
    assert.equal(isValidRecurringUuid(rpcCalls[0].payload.p_follow_up_id), true);
    assert.equal(rpcCalls[0].payload.p_follow_up_id, expectedServerFollowUpId);

    // Must not issue any direct raw manual_todos insert/update for the parent or follow-up creation itself.
    assert.equal(transport.calls.some((c) => c.table === 'manual_todos' && c.operation === 'insert'), false);
    const updateCalls = transport.calls.filter((c) => c.table === 'manual_todos' && c.operation === 'update');
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].filters.find((f) => f.args[0] === 'id')?.args?.[1], expectedServerFollowUpId);
    assert.equal(updateCalls[0].payload.title, 'Edited follow-up title');

    assert.equal(hook.value.todoQueue.length, 0);
    const syncedFollowUp = hook.value.todos.find((t) => t._id === expectedServerFollowUpId);
    assert.ok(syncedFollowUp);
    assert.equal(syncedFollowUp.dueDate, '2026-11-20');
    assert.equal(syncedFollowUp.title, 'Edited follow-up title');

    // Case 2: offline-created recurring parent completed offline promotes create -> server UUID before atomic RPC.
    const callsBeforeOfflineCreate = transport.calls.length;
    await hook.update({ ...baseProps, isOnline: false });
    let offlineCreatedParent;
    await act(async () => {
      offlineCreatedParent = await hook.value.addTodo({
        title: 'Offline recurring item',
        dueDate: '2026-10-08',
        recurrence: { type: 'weekly', interval: 1 },
      });
    });
    assert.ok(offlineCreatedParent?._id);

    let offlineCreatedCompleteResult;
    await act(async () => {
      offlineCreatedCompleteResult = await hook.value.updateTodo(
        offlineCreatedParent._id,
        'status',
        'Done',
        offlineCreatedParent
      );
    });
    assert.ok(offlineCreatedCompleteResult?.followUpTodo?._id);

    await hook.update({ ...baseProps, isOnline: true });
    await act(async () => {
      await flushMicrotasks(24);
    });

    const case2Calls = transport.calls.slice(callsBeforeOfflineCreate);
    const case2Inserts = case2Calls.filter((c) => c.table === 'manual_todos' && c.operation === 'insert');
    const case2Rpcs = case2Calls.filter((c) => c.operation === 'rpc');
    assert.equal(case2Inserts.length, 1);
    assert.equal(case2Inserts[0].payload.title, 'Offline recurring item');
    assert.equal(case2Rpcs.length, 1);
    assert.equal(case2Rpcs[0].name, 'complete_recurring_manual_todo_v1');
    assert.equal(case2Rpcs[0].payload.p_todo_id, todoThreeId);
    assert.equal(case2Rpcs[0].payload.p_follow_up_id, deriveRecurringFollowUpId(todoThreeId));
    assert.equal(hook.value.todoQueue.length, 0);
  } finally {
    await hook.close();
  }
});
