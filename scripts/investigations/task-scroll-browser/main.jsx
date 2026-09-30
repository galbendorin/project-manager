import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DesktopTodoDetailModal from '../../../src/components/DesktopTodoDetailModal.jsx';
import MobileTodoDetailSheet from '../../../src/components/MobileTodoDetailSheet.jsx';
import { useMediaQuery } from '../../../src/hooks/useMediaQuery.js';
import '../../../src/styles/index.css';

const initialTodo = {
  _id: 'synthetic-scroll-task', title: 'SCROLL TEST Task', projectId: 'synthetic-project',
  projectName: 'Personal', owner: 'PM', status: 'Open', source: 'Manual',
  createdAt: '2026-09-30T10:00:00Z', updatedAt: '2026-09-30T10:00:00Z',
};
const makeChecklists = (scenario) => scenario === 'empty' ? [] : Array.from({ length: scenario === 'long' ? 2 : 1 }, (_, list) => ({
  id: `synthetic-list-${list}`, title: `Checklist ${list + 1}`,
  items: Array.from({ length: scenario === 'long' ? 24 : 8 }, (_, row) => ({
    id: `synthetic-item-${list}-${row}`, checked: false,
    title: scenario === 'long' ? `SCROLL TEST ${list + 1}.${row + 1} long checklist item with enough text to exercise wrapping on a narrow phone` : `SCROLL TEST Item ${row + 1}`,
  })),
}));

function Fixture() {
  const mobile = useMediaQuery('(max-width: 768px)');
  const [open, setOpen] = useState(true);
  const [scenario, setScenario] = useState('eight');
  const [readonly, setReadonly] = useState(false);
  const [todo, setTodo] = useState(initialTodo);
  const [checklists, setChecklists] = useState(() => makeChecklists('eight'));
  const [message, setMessage] = useState('');
  const updateItems = (transform) => setChecklists(lists => lists.map(list => ({ ...list, items: transform(list.items) })));
  const Component = mobile ? MobileTodoDetailSheet : DesktopTodoDetailModal;
  return <>
    <div className="space-y-4 p-6">
      <h1>Synthetic task scrolling verification</h1>
      <p>No auth, Supabase or production requests. Actual task and checklist components.</p>
      <label>Scenario <select value={scenario} onChange={event => { setScenario(event.target.value); setChecklists(makeChecklists(event.target.value)); }}>
        <option value="empty">Empty</option><option value="eight">Eight items</option><option value="long">Two long checklists</option>
      </select></label>
      <label><input type="checkbox" checked={readonly} onChange={event => setReadonly(event.target.checked)} /> Read-only</label>
      <label>Task status <select value={todo.status} onChange={event => setTodo(current => ({ ...current, status: event.target.value }))}><option>Open</option><option>Done</option></select></label>
      <button onClick={() => setOpen(true)}>Open synthetic task</button>
      <p role="status">{message}</p>
    </div>
    {open ? <Component
      todo={todo} canEdit={!readonly && todo.status !== 'Done'} checklistCanEdit={!readonly && todo.status !== 'Done'}
      projectOptions={[{ id: 'synthetic-project', name: 'Personal' }]}
      recurrenceOptions={[{ value: 'none', label: 'One-time' }]} recurrenceLabel={() => 'One-time'} statusClass={() => 'text-slate-600'}
      checklists={checklists} onClose={() => { setOpen(false); setMessage('Closed synthetic task'); }}
      onDeleteTodo={() => setMessage('Synthetic delete requested')}
      onUpdateTodo={(_, field, value) => setTodo(current => ({ ...current, [field]: value }))}
      onAddChecklist={() => setChecklists(lists => [...lists, { id: `new-list-${lists.length}`, title: 'New checklist', items: [] }])}
      onAddChecklistItems={async (id, text) => setChecklists(lists => lists.map(list => list.id === id ? { ...list, items: [...list.items, { id: `added-${list.items.length}`, title: text, checked: false }] } : list))}
      onDeleteChecklist={id => setChecklists(lists => lists.filter(list => list.id !== id))}
      onDeleteChecklistItem={id => updateItems(items => items.filter(item => item.id !== id))}
      onMoveChecklistItem={(id, itemId, delta) => setChecklists(lists => lists.map(list => {
        if (list.id !== id) return list;
        const items = [...list.items], from = items.findIndex(item => item.id === itemId), to = from + delta;
        if (from < 0 || to < 0 || to >= items.length) return list;
        [items[from], items[to]] = [items[to], items[from]];
        return { ...list, items };
      }))}
      onRenameChecklist={(id, title) => setChecklists(lists => lists.map(list => list.id === id ? { ...list, title } : list))}
      onRenameChecklistItem={(id, title) => updateItems(items => items.map(item => item.id === id ? { ...item, title } : item))}
      onToggleChecklistItem={(id, checked) => updateItems(items => items.map(item => item.id === id ? { ...item, checked } : item))}
    /> : null}
  </>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture /></React.StrictMode>);
