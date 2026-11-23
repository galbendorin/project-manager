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

function makeMatrixWindow({ matrixMode = true, timerDriver = null } = {}) {
  const storage = {
    getItem: (key) => {
      if (key === 'pmworkspace:todo-view-mode:v1') {
        return matrixMode ? '{"mode":"matrix"}' : '{"mode":"list"}';
      }
      if (key === 'pmworkspace:todo-command-state:v1') {
        return '{"scope":"all","focusView":"all"}';
      }
      return null;
    },
    setItem() {},
    removeItem() {},
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
  return { window, document, winListeners, docListeners };
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

test('failed recurring follow-up is recoverable without duplicates across outage and lost-ACK retry paths', async () => {
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

  let insertMode = 'fail-before-write'; // then 'fail-after-write' on separate retry test
  let insertAttempts = 0;

  const transport = mockTransport((request) => {
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
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;

  const project = { id: projectOneId, name: 'Ops', tasks: [], registers: {}, tracker: [], version: 1 };

  let hookRef;
  function Harness() {
    const todoState = useProjectTodos({
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
      onCompleteTodo: async () => ({ ok: true }),
      onUpdateTodo: todoState.updateTodo,
      onRetryRecurringFollowUp: todoState.retryRecurringFollowUp,
    });
  }

  let root;
  await act(async () => {
    root = create(React.createElement(Harness));
  });

  try {
    // 1) Failing insert before DB write: parent is Done, NO unpersisted ghost row added to state!
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

    const retryBtn = root.root.findAllByType('button').find((b) => b.children.includes('Retry next occurrence'));
    assert.ok(retryBtn);

    // Attempt 2: Lost ACK path — insert writes row with SAME ID then fails response and transient reconcile fails.
    insertMode = 'fail-after-write-block-reconcile';
    await act(async () => {
      await retryBtn.props.onClick();
    });
    assert.equal(insertAttempts, 2);
    assert.equal(dbRows.size, 2);

    // Attempt 3: Reconcile succeeds and finds the committed row WITHOUT inserting a duplicate!
    insertMode = 'ok';
    const retryAgainBtn = root.root.findAllByType('button').find((b) => b.children.includes('Retry next occurrence'));
    await act(async () => {
      await retryAgainBtn.props.onClick();
    });

    assert.equal(insertAttempts, 2);
    assert.equal(dbRows.size, 2);
    assert.equal(hookRef.todos.filter((t) => t.status === 'Open').length, 1);
    assert.equal(
      root.root.findAllByType('button').some((b) => b.children.includes('Retry next occurrence')),
      false
    );
  } finally {
    await act(async () => root.unmount());
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
