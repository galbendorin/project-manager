import React, { useEffect, useRef } from 'react';
import { formatDate } from '../utils/helpers';
import TaskCardChecklistPanel from './TaskCardChecklistPanel';
import TaskRecurrenceIndicator from './TaskRecurrenceIndicator';
const Field = ({ label, children }) => <label className="task-field"><span>{label}</span>{children}</label>;
const Value = ({ children }) => <div className="task-read-value">{children}</div>;
export default function TodoDetailDialog({
  todo, isMobile = false, canEdit, projectOptions = [], onClose, onDeleteTodo,
  onUpdateTodo, recurrenceOptions = [], recurrenceLabel, statusClass,
  planningControls, sourcePlanControls, projectAssignmentControls,
  checklists = [], checklistCanEdit = false, checklistsAvailable = true,
  checklistsLoading = false, checklistMessage = '', checklistsSaving = false,
  onRetryChecklists, onAddChecklist, onAddChecklistItems, onDeleteChecklist,
  onDeleteChecklistItem, onMoveChecklistItem, onRenameChecklist,
  onRenameChecklistItem, onToggleChecklistItem,
}) {
  const dialog = useRef(null), close = useRef(null), onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (typeof document === 'undefined' || !dialog.current) return undefined;
    const origin = document.activeElement;
    close.current?.focus();
    const keydown = (event) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' && !event.target?.matches?.('select,input[type="date"]')) { event.preventDefault(); onCloseRef.current?.(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href]')].filter(node => node.getClientRects().length && !node.closest('[hidden]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (origin?.isConnected) origin.focus({ preventScroll: true }); else document.querySelector('.pm-task-ui button[aria-pressed="true"]')?.focus({ preventScroll: true }); };
  }, []);
  if (!todo) return null;
  const completed = todo.status === 'Done';
  const editSchedule = canEdit && !todo.planLink && !todo.meta?.projectPlanLink;
  const update = (field, value) => onUpdateTodo(todo._id, field, value);
  const removable = canEdit && !todo.isDerived && !completed && !todo.planLink && !todo.meta?.projectPlanLink;
  return <div className={`pm-task-dialog task-dialog-overlay ${isMobile ? 'task-dialog-phone' : ''}`}>
    <button type="button" className="task-dialog-backdrop" onClick={onClose} aria-label="Close task details" />
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Task details" className="task-dialog-window">
      <header className="task-dialog-header">
        <div className="task-dialog-heading"><h2 className={completed ? 'line-through' : ''}>{todo.title || 'Untitled'}</h2><div className="task-context"><span>{todo.isDerived ? `Read-only source: ${todo.source || 'Derived item'}` : 'Editable manual task'}</span><span className={`task-status ${statusClass?.(todo.status) || ""}`}>{todo.status || 'Open'}</span><TaskRecurrenceIndicator recurrence={todo.recurrence} /></div></div>
        <div className="task-dialog-header-actions">{removable ? <button type="button" className="task-danger-action" onClick={() => { onDeleteTodo(todo._id); onClose(); }}>Delete</button> : null}<button ref={close} type="button" onClick={onClose}>{isMobile ? 'Back' : 'Close'}</button></div>
      </header>
      <div className="task-dialog-body">
        <Field label="Title">{editSchedule ? <input type="text" value={todo.title || ''} onChange={e => update('title', e.target.value)} /> : <Value>{todo.title || 'Untitled'}</Value>}</Field>
        <Field label="Description">{canEdit ? <textarea value={todo.description || ''} rows={3} onChange={e => update('description', e.target.value)} placeholder="Add more detail…" /> : <Value>{todo.description || 'No description'}</Value>}</Field>
        <section aria-label="Project and dates" className="task-project-dates"><div>{projectAssignmentControls || <Field label="Project">{editSchedule ? <select value={todo.projectId || 'other'} onChange={e => update('projectId', e.target.value === 'other' ? null : e.target.value)}><option value="other">Other</option>{projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : <Value>{todo.projectName || 'Other'}</Value>}</Field>}</div><div>{planningControls || <Field label="Due date">{canEdit ? <input type="date" value={todo.dueDate || ''} onChange={e => update('dueDate', e.target.value)} /> : <Value>{todo.dueDate ? formatDate(todo.dueDate) : 'No deadline'}</Value>}</Field>}</div></section>
        <div className="task-property-fields">
          <Field label="Owner">{canEdit ? <input type="text" value={todo.owner || ''} onChange={e => update('owner', e.target.value)} /> : <Value>{todo.owner || 'Unassigned'}</Value>}</Field>
          <Field label="Repeat">{editSchedule ? <select value={todo.recurrence?.type || 'none'} onChange={e => update('recurrence', e.target.value === 'none' ? null : { type: e.target.value, interval: 1 })}>{recurrenceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <Value>{recurrenceLabel?.(todo.recurrence) || 'One-time'}</Value>}</Field>
          <Field label="Status">{editSchedule ? <select value={todo.status || 'Open'} onChange={e => update('status', e.target.value)}>{['Open','Done'].map(s => <option key={s}>{s}</option>)}</select> : <Value>{todo.status || 'Open'}</Value>}</Field>
        </div>
        <TaskCardChecklistPanel canEdit={checklistCanEdit} checklists={checklists} checklistsAvailable={checklistsAvailable} checklistsLoading={checklistsLoading} checklistMessage={checklistMessage} checklistsSaving={checklistsSaving} onRetryChecklists={onRetryChecklists} onAddChecklist={onAddChecklist} onAddChecklistItems={onAddChecklistItems} onDeleteChecklist={onDeleteChecklist} onDeleteChecklistItem={onDeleteChecklistItem} onMoveChecklistItem={onMoveChecklistItem} onRenameChecklist={onRenameChecklist} onRenameChecklistItem={onRenameChecklistItem} onToggleChecklistItem={onToggleChecklistItem} />
        {sourcePlanControls ? <details className="task-detail-disclosure" open={Boolean(todo.planLink || todo.meta?.projectPlanLink)}><summary>Project Plan</summary>{sourcePlanControls}</details> : null}
        <details className="task-detail-disclosure"><summary>Activity</summary><dl className="task-activity">{[['Created',todo.createdAt],['Last updated',todo.updatedAt],...(todo.completedAt ? [['Completed',todo.completedAt]] : [])].map(([label,date]) => <div key={label}><dt>{label}</dt><dd>{date ? new Date(date).toLocaleString('en-GB') : 'Unknown'}</dd></div>)}</dl></details>
      </div>
    </div>
  </div>;
}
