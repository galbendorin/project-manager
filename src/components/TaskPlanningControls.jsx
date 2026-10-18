import React, { useEffect, useRef, useState } from 'react';
import { deadlineDescription, matrixReference, plannedDayForTask, taskViewIdentity, validCalendarDay } from '../utils/todoEisenhower';
import { preferenceSnapshot } from '../utils/todoCalendar';
import { formatDate } from '../utils/helpers';
import TaskEditorDateField from './TaskEditorDateField';

export default function TaskPlanningControls({ todo, matrix, today, onUpdateTodo, onOpenSourceTodo, onNotice, draft, onDraftChange, deadlinePending = false, compact = false, presentation = 'default' }) {
  const identity = taskViewIdentity(todo);
  const [localWorkDay, setWorkDay] = useState(() => plannedDayForTask(todo, matrix.preferences) || today);
  const [localDeadline, setDeadline] = useState(todo.dueDate || '');
  const workDay = draft?.workDay ?? localWorkDay;
  const deadline = draft?.deadline ?? localDeadline;
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [localMoveWorkDay, setLocalMoveWorkDay] = useState(undefined);
  const [localPendingReschedule, setLocalPendingReschedule] = useState(null);
  const busy = useRef(false);
  const workInput = useRef(null), deadlineInput = useRef(null), workSave = useRef(null), deadlineSave = useRef(null);
  const returnDateFocus = (button, input, wasFocused) => {
    if (editor && wasFocused && mounted.current && current.current.identity === identity && typeof document !== 'undefined' && (document.activeElement === button.current || document.activeElement === document.body)) input.current?.focus({ preventScroll: true });
  };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dirty = useRef({ work: false, deadline: false });
  if (onDraftChange) dirty.current = { work: draft?.workDay !== undefined, deadline: draft?.deadline !== undefined };
  const current = useRef({ identity, workDay, deadline });
  current.current = { identity, workDay, deadline };
  const reference = matrixReference(todo);
  const available = matrix.ready && !matrix.offline && reference && todo.status !== 'Done';
  const waiting = saving || deadlinePending || Boolean(matrix.pending?.[reference?.task_key]);
  const planned = plannedDayForTask(todo, matrix.preferences);
  const preference = matrix.preferences[reference?.task_key];
  const moveWorkDay = draft?.moveWorkDay ?? localMoveWorkDay ?? Boolean(planned && planned === todo.dueDate);
  const pendingReschedule = draft?.reschedulePending || localPendingReschedule;
  const editor = presentation === 'editor';
  const workDayChanged = dirty.current.work || (Boolean(planned) && workDay !== planned);
  const deadlineChanged = deadline !== (todo.dueDate || '') || (moveWorkDay && planned !== deadline);
  useEffect(() => { if (!dirty.current.work && draft?.workDay === undefined) setWorkDay(planned || today); }, [planned, today, draft?.workDay]);
  useEffect(() => { if (!dirty.current.deadline && draft?.deadline === undefined) setDeadline(todo.dueDate || ''); }, [todo.dueDate, draft?.deadline]);
  const saveWorkDay = async (day, keyboardSave = false) => {
    if (busy.current || !available) return;
    const restoreFocus = keyboardSave && typeof document !== 'undefined' && Boolean(workSave.current) && document.activeElement === workSave.current;
    busy.current = true; setSaving(true); setMessage('');
    try {
      if (await matrix.planDay(todo, day)) {
        returnDateFocus(workSave, workInput, restoreFocus);
        if (current.current.workDay === day) { dirty.current.work = false; setWorkDay(day || today); onDraftChange?.('workDay', undefined, day); }
        if (mounted.current && current.current.identity === identity) {
          const notice = day ? `Work planned for ${day}. The deadline is unchanged.` : 'Personal selection removed. Due tasks still appear in Today.';
          setMessage(notice); onNotice?.(`${todo.title}: ${notice}`);
        }
      } else if (mounted.current && current.current.identity === identity) { setMessage('Your personal plan was not saved. Keep this date and try again.'); onNotice?.(`${todo.title}: personal plan was not saved. Your input is kept; try again.`); }
    } finally { busy.current = false; if (current.current.identity === identity) setSaving(false); }
  };
  const reschedule = async (reviewLatest = false, keyboardSave = false) => {
    const submitted = pendingReschedule?.deadline || deadline;
    if (busy.current || !available || !validCalendarDay(submitted) || todo.isDerived || todo.planLink || todo.meta?.projectPlanLink) return;
    const restoreFocus = keyboardSave && typeof document !== 'undefined' && Boolean(deadlineSave.current) && document.activeElement === deadlineSave.current;
    const expectedPreference = (!reviewLatest && pendingReschedule?.expectedPreference) || preferenceSnapshot(preference);
    const paired = Boolean(pendingReschedule || moveWorkDay);
    busy.current = true; setSaving(true); setMessage('');
    try {
      const result = await onUpdateTodo?.(todo._id, 'dueDate', submitted, { requireConfirmation: true, moveWorkDay: paired, expectedPreference, retryPersonalOnly: Boolean(pendingReschedule) });
      if (!mounted.current || current.current.identity !== identity) return;
      if (result?.confirmed && result.updatedTodo?._id === todo._id && result.updatedTodo?.dueDate === submitted) {
        if (result.personalPlanPending) {
          setLocalPendingReschedule({ deadline: submitted, expectedPreference });
          onDraftChange?.('reschedulePending', { deadline: submitted, expectedPreference });
          setMessage(`Deadline saved: ${submitted}. Your personal day was not saved. Retry the personal day only.`);
          return;
        }
        onDraftChange?.('reschedulePending', undefined);
        returnDateFocus(deadlineSave, deadlineInput, restoreFocus);
        setLocalPendingReschedule(null);
        if (paired && result.personalPlanConfirmed) {
          if (current.current.workDay === workDay) { dirty.current.work = false; setWorkDay(submitted); onDraftChange?.('workDay', undefined, workDay); }
        }
        if (current.current.deadline === submitted) { dirty.current.deadline = false; setDeadline(submitted); onDraftChange?.('deadline', undefined, submitted); }
        setMessage(paired ? `Deadline and your personal day saved: ${submitted}.` : `Deadline saved: ${submitted}. Your personal day is unchanged.`);
        onNotice?.(`${todo.title}: ${paired ? 'deadline and personal day' : 'deadline'} moved to ${submitted}.`);
      } else { setMessage('Deadline was not confirmed. Your input is retained; reconnect or retry.'); onNotice?.(`${todo.title}: deadline was not confirmed. Your input is retained; reconnect or retry.`); }
    } catch {
      if (mounted.current && current.current.identity === identity) { setMessage('Deadline was not saved. Your input is retained; try again.'); onNotice?.(`${todo.title}: deadline was not saved. Your input is retained; try again.`); }
    } finally { busy.current = false; if (current.current.identity === identity) setSaving(false); }
  };
  const body = (
    <div className="task-date-controls text-xs text-slate-600">
      <div className="task-planning-status" data-overdue={validCalendarDay(todo.dueDate) && todo.dueDate < today ? 'true' : undefined}>
        <p className="task-deadline-summary">{deadlineDescription(todo, today)}</p>
        {planned && !editor ? <p>Personally planned for {formatDate(planned)}</p> : null}
      </div>
      <div className="task-workday-controls">
      <div className="task-date-save-row">{editor ? <TaskEditorDateField inputRef={workInput} label="Personal work day" ariaLabel={`Personal work day for ${todo.title}`} value={!planned && !workDayChanged ? '' : workDay} emptyLabel="Not planned" onChange={event => { dirty.current.work = true; setWorkDay(event.target.value); onDraftChange?.('workDay', event.target.value); }} /> : <label className="task-planning-label">Personal work day
        <input aria-label={`Personal work day for ${todo.title}`} type="date" value={workDay} onChange={(event) => { dirty.current.work = true; setWorkDay(event.target.value); onDraftChange?.('workDay', event.target.value); }} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border bg-white px-2 text-sm" />
      </label>}
      {!editor || workDayChanged || saving ? <button ref={workSave} type="button" disabled={!available || waiting || !validCalendarDay(workDay)} onClick={event => void saveWorkDay(workDay, event?.detail === 0)} className="task-date-save-button min-h-11 rounded-lg border px-3 disabled:opacity-50">Save personal day</button> : null}</div>
      <p className="task-planning-hint">{editor ? 'Your deadline stays the same.' : 'Choosing a work day does not change the deadline.'}</p>
      <div className="task-day-shortcuts">
        <button type="button" disabled={!available || waiting} onClick={() => void saveWorkDay(today)} className="min-h-11 disabled:opacity-50">Work on today</button>
        {planned ? <button type="button" disabled={!available || waiting} onClick={() => void saveWorkDay(null)} className="min-h-11 disabled:opacity-50">Remove personal day</button> : null}
      </div>
      </div>
      {todo.isDerived || todo.planLink || todo.meta?.projectPlanLink ? (
        <button type="button" disabled={!onOpenSourceTodo} onClick={() => onOpenSourceTodo?.(todo)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Reschedule in source</button>
      ) : (
        <div className="task-reschedule-controls space-y-2 border-t pt-3">
          {editor ? <TaskEditorDateField inputRef={deadlineInput} label="Deadline" ariaLabel={`Deadline for ${todo.title}`} value={deadline} onChange={event => { dirty.current.deadline = true; setDeadline(event.target.value); onDraftChange?.('deadline', event.target.value); }} /> : <label className="task-planning-label">Deadline
            <input aria-label={`Deadline for ${todo.title}`} type="date" value={deadline} onChange={(event) => { dirty.current.deadline = true; setDeadline(event.target.value); onDraftChange?.('deadline', event.target.value); }} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border bg-white px-2 text-sm" />
          </label>}
          <label className="task-move-workday"><input type="checkbox" checked={moveWorkDay} disabled={Boolean(pendingReschedule)} onChange={event => { setLocalMoveWorkDay(event.target.checked); onDraftChange?.('moveWorkDay', event.target.checked); }} /><span>Also move my work day to this date</span></label>
          {!editor || deadlineChanged || pendingReschedule ? <p>{pendingReschedule ? `Deadline is saved. Retry your personal day for ${formatDate(pendingReschedule.deadline)}.` : moveWorkDay ? `Both dates will move to ${formatDate(deadline) || 'the chosen date'}.` : `Only the deadline will move. Personal day: ${formatDate(planned) || 'not set'}.`}</p> : null}
          {pendingReschedule ? <p>Current personal day: {formatDate(planned) || 'not set'}. <button type="button" disabled={!available || waiting} className="min-h-11 px-3 underline" onClick={() => void reschedule(true)}>Replace with the saved deadline date</button></p> : null}
          {pendingReschedule ? <button type="button" disabled={waiting} className="min-h-11 px-3 underline" onClick={() => { setLocalPendingReschedule(null); onDraftChange?.('reschedulePending', undefined); setMessage('Unfinished personal-day move removed. Saved dates and your newer draft are unchanged.'); }}>Keep my current personal day</button> : null}
          {!editor || deadlineChanged || pendingReschedule || saving ? <button ref={deadlineSave} type="button" disabled={!available || waiting || !validCalendarDay(pendingReschedule?.deadline || deadline) || !onUpdateTodo} onClick={event => void reschedule(false, event?.detail === 0)} className="task-date-save-button min-h-11 rounded-lg border px-3 disabled:opacity-50">{pendingReschedule ? 'Retry personal day' : 'Reschedule deadline'}</button> : null}
        </div>
      )}
      {!reference ? <p>Save this task with a stable ID to plan your work day.</p> : matrix.offline ? <p>Reconnect to save dates. Confirmed choices are retained.</p> : null}
      {waiting ? <p role="status">Saving… You can keep typing; wait for confirmation before saving again.</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
  return compact ? <details className="mt-3 border-t pt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-indigo-700">Plan / reschedule</summary>{body}</details> : <div className={`task-planning ${presentation === 'editor' ? 'task-planning-editor' : 'mt-4 rounded-xl border bg-slate-50 p-3'}`}>{body}</div>;
}
