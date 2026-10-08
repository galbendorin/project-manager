import React, { useEffect, useRef } from 'react';
import TaskCreationFields from './TaskCreationFields';

export default function TaskCreationDialog({ title, setTitle, draft, onChange, today, projects, onSubmit, onClose, status, onShowTask, onReviewRetry, currentPersonalDay, requestedPersonalDay }) {
  const windowRef = useRef(null);
  const titleRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const origin = document.activeElement;
    titleRef.current?.focus();
    const keydown = event => {
      if (event.key === 'Escape' && !event.target?.matches?.('select,input[type="date"]')) { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...windowRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (origin?.isConnected) origin.focus(); };
  }, []);
  return <div className="pm-task-dialog task-dialog-overlay">
    <button type="button" className="task-dialog-backdrop" aria-label="Close new task" onClick={onClose} />
    <form ref={windowRef} role="dialog" aria-modal="true" aria-label="Add task" className="task-dialog-window task-creation-window" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
      <header className="task-dialog-header"><h2>Add task</h2><button type="button" onClick={onClose}>Close</button></header>
      <div className="task-dialog-body">
        <label className="task-field"><span>Task name</span><input ref={titleRef} aria-label="New task name" value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs doing?" /></label>
        <TaskCreationFields draft={draft} onChange={onChange} today={today} projects={projects} matrix />
        <p className="text-xs">Saved in Tasks. Project Plan scheduling is separate.</p>
        {status ? <p role={status.error ? 'alert' : 'status'}>{status.saving ? 'Saving task and personal plan…' : status.error || status.message}</p> : null}
        {status?.retry ? <p className="text-xs">Current personal day: {currentPersonalDay || 'not set'}. Requested: {requestedPersonalDay || 'not set'}. <button type="button" className="min-h-11 px-3 underline" onClick={onReviewRetry}>Replace with my requested plan</button></p> : null}
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={status?.saving || (!title.trim() && !status?.retry)} className="task-inline-capture">{status?.retry ? 'Retry unfinished save' : 'Add task'}</button>{status?.task ? <button type="button" className="min-h-11 rounded-lg border px-3" onClick={() => onShowTask(status.task)}>Show task</button> : null}</div>
      </div>
    </form>
  </div>;
}
