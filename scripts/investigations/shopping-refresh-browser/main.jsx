import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useShoppingListData } from '../../../src/hooks/useShoppingListData.js';
import { useShoppingListActions } from '../../../src/hooks/useShoppingListActions.js';
import * as view from '../../../src/utils/shoppingListViewState.js';
import { mapManualTodoRow } from '../../../src/hooks/projectData/manualTodoUtils.js';
import { control, projects } from './environment.js';
const initial = () => ({ ...view.createEmptyShoppingOfflineState(), projects, selectedProjectId: 'a',
  todosByProject: { a: [{ _id: 'a-item', projectId: 'a', title: 'Milk', status: 'Open' }],
    b: [{ _id: 'b-item', projectId: 'b', title: 'Bread', status: 'Open' }] } });
let cached = initial();
const read = () => structuredClone(cached), readAsync = async () => read();
const persist = value => { cached = structuredClone(value); return read(); };
const normalize = value => value, no = () => false;
const extra = [];
function Fixture() {
  const members = useRef(false), ensuring = useRef(false);
  const [title, setTitle] = useState('New milk'), [status, setStatus] = useState('Ready');
  const data = useShoppingListData({ currentUserId: 'synthetic-owner', isOnline: true,
    canCreateProject: false, limits: { label: 'Fixture', maxProjects: 2 }, shoppingProjectName: 'Shopping List',
    loadShoppingOfflineState: read, loadShoppingOfflineStateAsync: readAsync, persistOfflineState: persist,
    normalizeProjectRecord: normalize, sortTodos: view.sortTodos, mapManualTodoRow,
    supportsProjectMembersRef: members, ensuringProjectRef: ensuring,
    isMissingSchemaFieldError: no, isMissingTodoRelationError: no, isProjectRelationMissingError: no,
    manualTodoSelect: '*', legacyManualTodoSelect: '*', shoppingExtraFields: extra });
  // Mirrors the product's cache effect: persist only after durable hydration.
  useEffect(() => { if (data.offlineStateHydrated) persist({ ...read(), projects: data.projects,
    selectedProjectId: data.selectedProjectId, todosByProject: { ...read().todosByProject, [data.selectedProjectId]: data.todos } });
  }, [data.offlineStateHydrated, data.projects, data.selectedProjectId, data.todos]);
  const actions = useShoppingListActions({ currentUserId: 'synthetic-owner', isOnline: true,
    selectedProject: data.selectedProject, todos: data.todos, setTodos: data.setTodos,
    setTodoError: data.setTodoError, beginTodoMutation: data.beginTodoMutation,
    loadShoppingOfflineState: read, persistOfflineState: persist, sortTodos: view.sortTodos,
    mapManualTodoRow, isMissingSchemaFieldError: no, manualTodoSelect: '*', legacyManualTodoSelect: '*' });
  const refresh = useCallback(async () => { await data.loadTodos(); setStatus('Refresh finished'); }, [data.loadTodos]);
  return <main style={{ maxWidth: 800, margin: 'auto', padding: 16, fontFamily: 'system-ui' }}>
    <h1>Q05 local refresh verification</h1><p>Real React data/actions hooks and cache effect. Synthetic service only.</p>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <button onClick={() => { control.hold = 'read:manual_todos'; void refresh(); setStatus('Old read held'); }}>Hold refresh</button>
      <button onClick={() => { control.hold = 'write:manual_todos'; setStatus('Next edit held'); }}>Hold next edit</button>
      <button onClick={() => void refresh()}>Refresh</button>
      <button onClick={() => { control.pending.shift()?.(false); setStatus('Released'); }}>Release success</button>
      <button onClick={() => { control.pending.shift()?.(true); setStatus('Released failure'); }}>Release failure</button>
    </div>
    <p><label>List <select value={data.selectedProjectId} onChange={event => data.setSelectedProjectId(event.target.value)}><option value="a">Home</option><option value="b">Weekend</option></select></label></p>
    <p role="status">{status}; loading: {String(data.loadingTodos)}</p>
    <ul>{data.todos.map(todo => <li key={todo._id}>{todo.title}</li>)}</ul>
    <label>Item name <input value={title} onChange={event => setTitle(event.target.value)}/></label>
    <button onClick={() => { void actions.updateTodoTitle(data.todos[0], title).then(() => setStatus('Edit finished')); }}>Save edit</button>
    <p role="alert">{data.todoError}</p>
    <button onClick={() => setStatus(JSON.stringify({ selected: cached.selectedProjectId, todos: cached.todosByProject, queue: cached.queue, writes: control.updates }))}>Show synthetic cache</button>
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
