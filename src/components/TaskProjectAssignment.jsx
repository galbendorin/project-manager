import React, { useEffect, useRef, useState } from 'react';

export default function TaskProjectAssignment({ todo, projects = [], canEdit, onUpdateTodo }) {
  const savedProject = todo.projectId || 'other';
  const [selection, setSelection] = useState(savedProject);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const dirty = useRef(false);
  const busy = useRef(false);
  const lifecycle = useRef({ active: true });
  useEffect(() => { const session = lifecycle.current = { active: true }; return () => { session.active = false; }; }, []);
  useEffect(() => { if (!dirty.current) setSelection(savedProject); }, [savedProject]);
  const editable = canEdit && !todo.isDerived && !todo.planLink && !todo.meta?.projectPlanLink && todo.status !== 'Done';
  const options = projects.filter((project) => project.id && project.name?.trim().toLowerCase() !== 'shopping list');
  const save = async () => {
    if (busy.current || !editable || !onUpdateTodo || selection === savedProject) return;
    if (selection !== 'other' && !options.some((project) => project.id === selection)) return;
    const session = lifecycle.current;
    const projectId = selection === 'other' ? null : selection;
    busy.current = true; setSaving(true); setMessage(''); setFailed(false);
    try {
      const result = await onUpdateTodo(todo._id, 'projectId', projectId, { requireConfirmation: true });
      if (!session.active) return;
      if (result?.confirmed && result.updatedTodo?._id === todo._id && (result.updatedTodo.projectId || null) === projectId) {
        dirty.current = false;
        setMessage(`Project saved: ${options.find((project) => project.id === projectId)?.name || 'Other / no project'}.`);
      } else {
        setFailed(true); setMessage('Project was not saved. Your choice is kept; refresh the task or reconnect and retry.');
      }
    } catch {
      if (session.active) { setFailed(true); setMessage('Project was not saved. Your choice is kept; try again.'); }
    } finally {
      busy.current = false;
      if (session.active) setSaving(false);
    }
  };
  return <div className="rounded-xl border border-slate-200 bg-white p-3">
    <label className="block text-sm font-semibold text-slate-700">Task project
      {editable ? <select aria-label="Task project" value={selection} disabled={saving} onChange={(event) => { dirty.current = true; setSelection(event.target.value); setMessage(''); setFailed(false); }} className="mt-2 min-h-[44px] w-full min-w-0 rounded-lg border bg-white px-3 text-sm font-normal">
        <option value="other">Other / no project</option>
        {options.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select> : <span className="mt-2 block text-sm font-normal">{todo.projectName || options.find((project) => project.id === todo.projectId)?.name || 'Other / no project'}</span>}
    </label>
    {editable ? <>
      <p className="mt-2 text-xs text-slate-500">Assigns this task to a project while keeping it in Tasks.</p>
      {selection !== 'other' && selection !== savedProject ? <p className="mt-2 text-xs text-slate-500">Project collaborators will be able to access this task and its checklists.</p> : null}
      <button type="button" disabled={saving || selection === savedProject || !onUpdateTodo} onClick={save} className="mt-3 min-h-[44px] rounded-lg border border-indigo-200 px-4 text-sm font-semibold text-indigo-700 disabled:opacity-40">{saving ? 'Saving project…' : 'Save project'}</button>
      {dirty.current && selection !== savedProject && !saving ? <p className="mt-2 text-xs text-slate-500">Choose Save project before closing.</p> : null}
    </> : null}
    {message ? <p role={failed ? 'alert' : 'status'} className="mt-2 text-sm text-slate-600">{message}</p> : null}
  </div>;
}
