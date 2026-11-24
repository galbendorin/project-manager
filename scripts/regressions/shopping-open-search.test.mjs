import test from 'node:test';
import assert from 'node:assert/strict';
import { React, act, create, mockTransport, sourceModules } from './react-source-runtime.mjs';

const textContent = (node) => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || !Array.isArray(node.children)) return '';
  return node.children.map(textContent).join('');
};

const Icon = ({ className = '' }) => React.createElement('span', { className });

async function renderItemsPanel(overrides = {}) {
  const transport = mockTransport(() => {
    throw new Error('ShoppingListItemsPanel must not call Supabase directly');
  });
  const load = await sourceModules(transport, {
    window: {
      localStorage: {
        getItem: () => 'true',
        setItem: () => {},
      },
      setTimeout,
      clearTimeout,
    },
  });
  const ShoppingListItemsPanel = (await load('src/components/ShoppingListItemsPanel.jsx')).default;

  const toggled = [];
  const openTodos = [
    { _id: 'todo-whole-milk', title: 'Whole milk', status: 'Open', quantityValue: 2, quantityUnit: 'l' },
    { _id: 'offline-bread', title: 'Sourdough Bread', status: 'Open', quantityValue: 1, quantityUnit: 'loaf' },
    { _id: 'todo-oat-milk', title: 'Oat Milk', status: 'Open', quantityValue: 1, quantityUnit: 'carton' },
    { _id: 'pending-almond-milk', title: 'Almond milk', status: 'Open', _shoppingOperationId: 'op-almond' },
  ];
  const completedTodos = [
    {
      _id: 'todo-eggs',
      title: 'Brown Eggs',
      status: 'Done',
      createdAt: '2026-11-20T09:00:00.000Z',
      updatedAt: '2026-11-20T09:00:00.000Z',
      completedAt: '2026-11-20T09:00:00.000Z',
    },
  ];
  const completedTodoGroups = [
    {
      key: 'brown eggs',
      title: 'Brown Eggs',
      primaryTodo: completedTodos[0],
      todos: completedTodos,
      count: 1,
    },
  ];

  const props = {
    CheckIcon: Icon,
    ChevronDownIcon: Icon,
    ListChecksIcon: Icon,
    LoaderIcon: Icon,
    ShoppingBasketIcon: Icon,
    TrashIcon: Icon,
    completedTodoGroups,
    completedTodos,
    deleteTodo: () => {},
    desktopCompact: true,
    editingError: '',
    editingTitle: '',
    editingTodoId: '',
    emptyState: { status: 'ok', title: 'Ready', detail: 'Ready' },
    failedTodoId: '',
    failedTodoMessage: '',
    handleCancelEditingTodo: () => {},
    handleSaveEditingTodo: () => {},
    handleStartEditingTodo: () => {},
    handleToggleTodo: (todo) => toggled.push(todo),
    isCompactDesktop: true,
    isMobile: false,
    isOnline: true,
    loadingTodos: false,
    offlineQueue: [{ kind: 'create', targetId: 'offline-bread' }],
    openTodos,
    onAddAgain: () => {},
    pendingCompleteId: '',
    pendingCompleteSeconds: 1,
    queuedTodoIds: new Set(['offline-bread']),
    retryShoppingSync: () => {},
    retryTodoAction: () => {},
    savingTodoAction: '',
    savingTodoId: '',
    selectedProjectId: 'project-1',
    setDesktopCompact: () => {},
    setEditingTitle: () => {},
    shouldCollapseBought: false,
    showBought: true,
    setShowBought: () => {},
    shoppingSyncSummary: '1 pending grocery change saved on this device',
    syncingQueue: false,
    todos: [...openTodos, ...completedTodos],
    ...overrides,
  };

  let root;
  let focused = false;
  await act(async () => {
    root = create(React.createElement(ShoppingListItemsPanel, props), {
      createNodeMock: (element) => (element.type === 'input' ? { focus: () => { focused = true; } } : null),
    });
  });

  return {
    root,
    props,
    ShoppingListItemsPanel,
    transport,
    toggled,
    wasFocused: () => focused,
    async close() {
      await act(async () => root.unmount());
    },
  };
}

test('open grocery search filters case-insensitively, preserves order/sync/Bought, and clears cleanly', async () => {
  const f = await renderItemsPanel();
  try {
    const findSearchInput = () => {
      const label = f.root.root.findAllByType('label').find((node) => textContent(node) === 'Find an open grocery');
      assert.ok(label, 'Search field should have an accessible label');
      return f.root.root.findAllByType('input').find((node) => node.props.id === label.props.htmlFor && node.props.type === 'search');
    };
    const openRowIds = () => f.root.root
      .findAll((node) => node.type === 'div' && typeof node.props['data-shopping-open-todo-id'] === 'string')
      .map((node) => node.props['data-shopping-open-todo-id']);
    const findClearButton = () => f.root.root.findAllByType('button').find((node) => textContent(node) === 'Clear');

    assert.deepEqual(openRowIds(), [
      'todo-whole-milk',
      'offline-bread',
      'todo-oat-milk',
      'pending-almond-milk',
    ]);
    assert.equal(findClearButton(), undefined);

    await act(async () => {
      findSearchInput().props.onChange({ target: { value: 'MILK' } });
    });

    assert.deepEqual(openRowIds(), [
      'todo-whole-milk',
      'todo-oat-milk',
      'pending-almond-milk',
    ]);
    assert.ok(f.root.root.findAll((node) => textContent(node) === 'Showing 3 of 4 open groceries').length > 0);
    assert.ok(f.root.root.findAll((node) => textContent(node) === 'Saved changes').length > 0);
    assert.ok(f.root.root.findAll((node) => textContent(node) === 'Pending addition').length > 0);
    assert.ok(f.root.root.findAll((node) => textContent(node) === 'Brown Eggs').length > 0, 'Bought history stays visible');

    await act(async () => {
      f.root.root.findAllByType('button').find((node) => node.props['aria-label'] === 'Mark Oat Milk as bought').props.onClick();
    });
    assert.equal(f.toggled.at(-1)?._id, 'todo-oat-milk');

    await act(async () => {
      f.root.root.findAllByType('button').find((node) => node.props['aria-label'] === 'Move Brown Eggs back to open').props.onClick();
    });
    assert.equal(f.toggled.at(-1)?._id, 'todo-eggs');

    await act(async () => {
      findSearchInput().props.onChange({ target: { value: 'avocado' } });
    });
    assert.deepEqual(openRowIds(), []);
    assert.ok(f.root.root.findAll((node) => textContent(node).includes('No open groceries match “avocado”.')).length > 0);
    assert.equal(f.root.root.findAll((node) => textContent(node) === 'Nothing open right now.').length, 0);
    assert.ok(f.root.root.findAll((node) => textContent(node) === 'Brown Eggs').length > 0, 'Bought history stays intact on no-match');

    await act(async () => {
      findClearButton().props.onClick();
    });
    assert.equal(findSearchInput().props.value, '');
    assert.equal(f.wasFocused(), true);
    assert.deepEqual(openRowIds(), [
      'todo-whole-milk',
      'offline-bread',
      'todo-oat-milk',
      'pending-almond-milk',
    ]);
    assert.ok(f.root.root.findAll((node) => textContent(node) === 'Saved offline').length > 0);

    await act(async () => {
      findSearchInput().props.onChange({ target: { value: 'bread' } });
    });
    assert.deepEqual(openRowIds(), ['offline-bread']);
    assert.ok(f.root.root.findAll((node) => textContent(node) === 'Saved offline').length > 0);

    await act(async () => {
      f.root.update(React.createElement(f.ShoppingListItemsPanel, { ...f.props, selectedProjectId: 'project-2' }));
    });
    assert.equal(findSearchInput().props.value, '');
    assert.equal(f.transport.calls.length, 0);
  } finally {
    await f.close();
  }
});

test('mobile check-off and Undo keep working while open groceries are filtered', async () => {
  const f = await renderItemsPanel({
    isMobile: true,
    isCompactDesktop: false,
    shouldCollapseBought: true,
    showBought: true,
    pendingCompleteId: 'todo-oat-milk',
    pendingCompleteSeconds: 1,
  });
  try {
    const searchInput = f.root.root.findAllByType('input').find((node) => node.props.type === 'search');
    await act(async () => {
      searchInput.props.onChange({ target: { value: 'oat' } });
    });

    const undoChip = f.root.root.findAllByType('button').find((node) => textContent(node).includes('Undo 1s'));
    assert.ok(undoChip, 'Mobile pending Undo button should remain clickable when filtered');
    await act(async () => {
      undoChip.props.onClick();
    });
    assert.equal(f.toggled.at(-1)?._id, 'todo-oat-milk');
  } finally {
    await f.close();
  }
});
