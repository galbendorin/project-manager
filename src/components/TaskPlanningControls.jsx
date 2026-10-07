import React, { useEffect, useRef, useState } from 'react';
import { deadlineDescription, matrixReference, plannedDayForTask, taskViewIdentity, validCalendarDay } from '../utils/todoEisenhower';

export default function TaskPlanningControls({ todo, matrix, today, onUpdateTodo, onOpenSourceTodo, onNotice, draft, onDraftChange, deadlinePending = false, compact = false, presentation = 'default' }) {
  const identity = taskViewIdentity(todo);
  const [localWorkDay, setWorkDay] = useState(() => plannedDayForTask(todo, matrix.preferences) || today);
  const [localDeadline, setDeadline] = useState(todo.dueDate || '');
  const workDay = draft?.workDay ?? localWorkDay;
  const deadline = draft?.deadline ?? localDeadline;
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const dirty = useRef({ work: false, deadline: false });
  if (onDraftChange) dirty.current = { work: draft?.workDay !== undefined, deadline: draft?.deadline !== undefined };
  const current = useRef({ identity, workDay, deadline });
  current.current = { identity, workDay, deadline };
  const reference = matrixReference(todo);
  const available = matrix.ready && !matrix.offline && reference && todo.status !== 'Done';
  const waiting = saving || deadlinePending || Boolean(matrix.pending?.[reference?.task_key]);
  const planned = plannedDayForTask(todo, matrix.preferences);
  useEffect(() => { if (!dirty.current.work && draft?.workDay === undefined) setWorkDay(planned || today); }, [planned, today, draft?.workDay]);
  useEffect(() => { if (!dirty.current.deadline && draft?.deadline === undefined) setDeadline(todo.dueDate || ''); }, [todo.dueDate, draft?.deadline]);
  const saveWorkDay = async (day) => {
    if (busy.current || !available) return;
    busy.current = true; setSaving(true); setMessage('');
    try {
      if (await matrix.planDay(todo, day)) {
        if (current.current.workDay === day) { dirty.current.work = false; setWorkDay(day || today); onDraftChange?.('workDay', undefined, day); }
        if (current.current.identity === identity) {
          const notice = day ? `Work planned for ${day}. The deadline is unchanged.` : 'Personal selection removed. Due tasks still appear in Today.';
          setMessage(notice); onNotice?.(`${todo.title}: ${notice}`);
        }
      } else if (current.current.identity === identity) { setMessage('Your personal plan was not saved. Keep this date and try again.'); onNotice?.(`${todo.title}: personal plan was not saved. Your input is kept; try again.`); }
    } finally { busy.current = false; if (current.current.identity === identity) setSaving(false); }
  };
  const reschedule = async () => {
    if (busy.current || !available || !validCalendarDay(deadline) || todo.isDerived || todo.planLink || todo.meta?.projectPlanLink) return;
    const submitted = deadline;
    busy.current = true; setSaving(true); setMessage('');
    try {
      const result = await onUpdateTodo?.(todo._id, 'dueDate', submitted, { requireConfirmation: true });
      if (current.current.identity !== identity) return;
      if (result?.confirmed && result.updatedTodo?._id === todo._id && result.updatedTodo?.dueDate === submitted) {
        if (current.current.deadline === submitted) { dirty.current.deadline = false; setDeadline(submitted); onDraftChange?.('deadline', undefined, submitted); }
        setMessage(`Deadline saved: ${submitted}.`);
        onNotice?.(`${todo.title}: deadline moved to ${submitted}.`);
      } else { setMessage('Deadline was not confirmed. Your input is retained; reconnect or retry.'); onNotice?.(`${todo.title}: deadline was not confirmed. Your input is retained; reconnect or retry.`); }
    } catch {
      if (current.current.identity === identity) { setMessage('Deadline was not saved. Your input is retained; try again.'); onNotice?.(`${todo.title}: deadline was not saved. Your input is retained; try again.`); }
    } finally { busy.current = false; if (current.current.identity === identity) setSaving(false); }
  };
  const body = (
    <div className="task-date-controls space-y-3 text-xs text-slate-600">
      <p className="text-sm font-medium">{deadlineDescription(todo, today)}</p>
      {planned ? <p>Personally planned for {planned}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!available || waiting} onClick={() => void saveWorkDay(today)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Work on today</button>
        {planned ? <button type="button" disabled={!available || waiting} onClick={() => void saveWorkDay(null)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Remove personal day</button> : null}
      </div>
      <div className="task-date-save-row"><label className="block">Personal work day
        <input aria-label={`Personal work day for ${todo.title}`} type="date" value={workDay} onChange={(event) => { dirty.current.work = true; setWorkDay(event.target.value); onDraftChange?.('workDay', event.target.value); }} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border bg-white px-2 text-sm" />
      </label>
      <button type="button" disabled={!available || waiting || !validCalendarDay(workDay)} onClick={() => void saveWorkDay(workDay)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Save personal day</button></div>
      <p>Choosing a work day does not change the deadline.</p>
      {todo.isDerived || todo.planLink || todo.meta?.projectPlanLink ? (
        <button type="button" disabled={!onOpenSourceTodo} onClick={() => onOpenSourceTodo?.(todo)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Reschedule in source</button>
      ) : (
        <div className="task-date-save-row space-y-2 border-t pt-3">
          <label className="block">Deadline
            <input aria-label={`Deadline for ${todo.title}`} type="date" value={deadline} onChange={(event) => { dirty.current.deadline = true; setDeadline(event.target.value); onDraftChange?.('deadline', event.target.value); }} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border bg-white px-2 text-sm" />
          </label>
          <button type="button" disabled={!available || waiting || !validCalendarDay(deadline) || !onUpdateTodo} onClick={() => void reschedule()} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Reschedule deadline</button>
        </div>
      )}
      {!reference ? <p>Save this task with a stable ID to plan your work day.</p> : matrix.offline ? <p>Reconnect to save dates. Confirmed choices are retained.</p> : null}
      {waiting ? <p role="status">Saving… You can keep typing; wait for confirmation before saving again.</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
  return compact ? <details className="mt-3 border-t pt-2"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-indigo-700">Plan / reschedule</summary>{body}</details> : <div className={`task-planning ${presentation === 'editor' ? 'task-planning-editor' : 'mt-4 rounded-xl border bg-slate-50 p-3'}`}>{body}</div>;
}
