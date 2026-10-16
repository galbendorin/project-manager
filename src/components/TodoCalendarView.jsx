import React, { useEffect, useRef, useState } from 'react';
import { deadlineDescription, taskViewIdentity } from '../utils/todoEisenhower';
import { calendarWeek, calendarDayLabel, calendarTime, shiftCalendarDay, layoutCalendarDay, calendarOverlaps, calendarTimePassed, preferenceSnapshot, validCalendarSlot } from '../utils/todoCalendar';

function CalendarEditor({ todo, draft, onChange, onClose, onSave, onRemove, onOpenTodo, onReload, onReview, disabled, canRemove, today }) {
  const box = useRef(null), close = useRef(null), latestClose = useRef(onClose);
  latestClose.current = onClose;
  useEffect(() => {
    if (typeof document === 'undefined' || !box.current) return undefined;
    const origin = document.activeElement; close.current?.focus();
    const key = event => {
      if (event.key === 'Escape' && !event.target?.matches?.('input[type="date"],input[type="time"],select')) { event.preventDefault(); latestClose.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...box.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !box.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !box.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (origin?.isConnected) origin.focus({ preventScroll: true }); else document.querySelector('.task-calendar-toolbar button')?.focus(); };
  }, []);
  return <div className="pm-task-dialog task-dialog-overlay">
    <button type="button" className="task-dialog-backdrop" aria-label="Close time editor" onClick={onClose} />
    <div ref={box} role="dialog" aria-modal="true" aria-label="Plan task time" className="task-calendar-editor">
      <header><h3>{todo.title || 'Untitled'}</h3><button ref={close} type="button" onClick={onClose}>Close</button></header>
      <p className="task-calendar-project">{todo.projectName || 'Other'}</p>
      <form onSubmit={event => { event.preventDefault(); onSave(); }}>
        <label>Personal work day<input type="date" value={draft.day} disabled={draft.pending} onChange={event => onChange({ day: event.target.value })} required /></label>
        <label>Start time<select aria-label="Start time" value={draft.start} disabled={draft.pending} onChange={event => onChange({ start: event.target.value })}>{Array.from({ length: 34 }, (_, index) => calendarTime(360 + index * 30)).map(time => <option key={time} value={time}>{time}</option>)}</select></label>
        <label>Minutes to reserve<input type="number" min="30" max="1020" step="30" value={draft.duration} disabled={draft.pending} onChange={event => onChange({ duration: event.target.value })} required /></label>
        <p>{deadlineDescription(todo, today)} · Deadline stays unchanged.</p>
        {draft.error ? <div role="alert"><p>{draft.error}</p><button type="button" onClick={onReload} disabled={disabled || draft.pending}>Reload saved plan</button><button type="button" onClick={onReview} disabled={disabled || draft.pending}>Review latest version</button></div> : null}
        {draft.reviewed ? <p role="status">Latest saved plan: {draft.reviewed}. Your requested time is kept. Check it before saving again.</p> : null}
        {draft.pending ? <p role="status">Saving your time block…</p> : null}
        <footer><button type="button" onClick={onOpenTodo} disabled={draft.pending}>Open task details</button><button type="button" onClick={onRemove} disabled={disabled || draft.pending || !canRemove}>Remove time</button><button type="submit" className="task-inline-capture" disabled={disabled || draft.pending}>{draft.pending ? 'Saving…' : 'Save block'}</button></footer>
      </form>
    </div>
  </div>;
}

export default function TodoCalendarView({ owner, enabled = true, today, selectedDay, onSelectDay, entries, allEntries, plan, isMobile, onOpenTodo, onPlanSlot, isLocked, handleCompleteTodo, transientTodos = [] }) {
  const [range, setRange] = useState('week');
  const [editorKey, setEditorKey] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [dropDay, setDropDay] = useState('');
  const [resizePreview, setResizePreview] = useState(null);
  const resizeClick = useRef(false);
  const dragged = useRef(null), pointerDrag = useRef(null), resizing = useRef(null), busy = useRef(new Set()), active = useRef(true), latest = useRef(null);
  latest.current = { entries, allEntries, plan, owner, isLocked, onPlanSlot };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (!enabled || typeof window === 'undefined') return undefined; const refresh = () => setNow(new Date()); refresh(); const timer = window.setInterval(refresh, 60000); window.addEventListener('focus', refresh); return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); }; }, [enabled]);
  useEffect(() => { if (plan.offline || !enabled) { dragged.current = null; pointerDrag.current = null; resizing.current = null; setResizePreview(null); setDropDay(''); } }, [plan.offline, enabled]);
  const week = calendarWeek(selectedDay);
  const days = isMobile ? [selectedDay] : range === 'weekend' ? week.slice(5) : week;
  const pool = entries.filter(entry => entry.day === selectedDay);
  const editorEntry = entries.find(entry => taskViewIdentity(entry.todo) === editorKey);
  const prefFor = entry => plan.preferences[entry.reference?.task_key];
  const blocked = entry => !entry.reference || !plan.ready || !plan.calendarReady || plan.loading || plan.offline || isLocked(entry.todo) || Boolean(plan.pending[entry.reference.task_key]);
  const makeDraft = entry => ({ day: entry.day, start: calendarTime(entry.start ?? 600), duration: entry.duration ?? 30, expected: preferenceSnapshot(prefFor(entry)), error: '', pending: false });
  const updateDraft = (key, patch) => setDrafts(previous => ({ ...previous, [key]: { ...previous[key], ...patch } }));
  const open = entry => { const key = taskViewIdentity(entry.todo); setDrafts(previous => previous[key] ? previous : { ...previous, [key]: makeDraft(entry) }); setEditorKey(key); };
  const save = async (entry, draft, remove = false) => {
    const key = taskViewIdentity(entry.todo), current = latest.current;
    if (busy.current.has(key) || blocked(entry) || remove && entry.start === null || current.owner !== owner || current.isLocked(entry.todo) || !current.entries.some(item => taskViewIdentity(item.todo) === key)) return;
    const [hour, minute] = String(draft.start).split(':').map(Number);
    const slot = { day: remove ? entry.day : draft.day, start: remove ? null : hour * 60 + minute, duration: remove ? null : Number(draft.duration) };
    if (!remove && !validCalendarSlot(slot.day, slot.start, slot.duration)) { updateDraft(key, { error: 'Choose half-hour increments between 06:00 and 23:00. The block must finish by 23:00.' }); setEditorKey(key); return; }
    busy.current.add(key); updateDraft(key, { ...draft, pending: true, error: '' });
    let saved = false;
    try { saved = await current.onPlanSlot(entry.todo, slot, draft.expected); } catch { /* Keep the retained draft for explicit retry. */ }
    finally { busy.current.delete(key); }
    if (!active.current || latest.current.owner !== owner) return;
    if (saved) {
      setDrafts(previous => { const next = { ...previous }; delete next[key]; return next; }); setEditorKey(value => value === key ? null : value);
      onSelectDay(slot.day); setNotice(`${entry.todo.title}: ${remove ? 'time removed; task stays in the day’s pool' : `${calendarDayLabel(slot.day)} · ${calendarTime(slot.start)}–${calendarTime(slot.start + slot.duration)}`} · Deadline unchanged.`);
    } else { updateDraft(key, { pending: false, error: 'Your time block was not confirmed. Your input is kept. Retry, or reload and review the latest saved plan.' }); setEditorKey(key); }
  };
  const gestureSave = (entry, day, start, duration = entry.duration ?? 30, expected = preferenceSnapshot(prefFor(entry))) => {
    if (!entry || blocked(entry)) return;
    const draft = { ...makeDraft(entry), day, start: calendarTime(start), duration, expected };
    setDrafts(previous => ({ ...previous, [taskViewIdentity(entry.todo)]: draft }));
    void save(entry, draft);
  };
  const chooseDay = day => { onSelectDay(day); };
  const clashText = entry => {
    const others = allEntries.filter(other => calendarOverlaps(entry, other));
    if (!others.length) return '';
    const visible = new Set(entries.map(item => taskViewIdentity(item.todo)));
    return `Overlaps ${others.length} planned task${others.length === 1 ? '' : 's'}${others.some(other => !visible.has(taskViewIdentity(other.todo))) ? ' (including a task hidden by filters)' : ''}`;
  };
  const startDrag = (event, entry) => { if (blocked(entry)) { event.preventDefault(); return; } dragged.current = { key: taskViewIdentity(entry.todo), owner, expected: preferenceSnapshot(prefFor(entry)), duration: entry.duration ?? 30 }; event.dataTransfer.setData('text/plain', dragged.current.key); event.dataTransfer.effectAllowed = 'move'; };
  const drop = (event, day) => {
    event.preventDefault(); const drag = dragged.current; dragged.current = null; setDropDay('');
    if (!drag || drag.owner !== owner) return;
    const entry = latest.current.entries.find(item => taskViewIdentity(item.todo) === drag.key); if (!entry) return;
    const rect = event.currentTarget.getBoundingClientRect(); const half = rect.height / 34;
    const duration = drag.duration;
    const start = Math.min(1380 - duration, 360 + Math.max(0, Math.min(33, Math.floor((event.clientY - rect.top) / half))) * 30);
    gestureSave(entry, day, start, duration, drag.expected);
  };
  const pointerTarget = event => document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-calendar-day]');
  const startPointerDrag = (event, entry) => {
    if (blocked(entry) || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    pointerDrag.current = { key: taskViewIdentity(entry.todo), pointer: event.pointerId, owner, expected: preferenceSnapshot(prefFor(entry)), duration: entry.duration ?? 30 };
  };
  const movePointerDrag = event => { if (pointerDrag.current?.pointer === event.pointerId) setDropDay(pointerTarget(event)?.getAttribute('data-calendar-day') || ''); };
  const finishPointerDrag = event => {
    const drag = pointerDrag.current; pointerDrag.current = null; setDropDay('');
    if (!drag || drag.pointer !== event.pointerId || drag.owner !== owner) return;
    const target = pointerTarget(event), entry = latest.current.entries.find(item => taskViewIdentity(item.todo) === drag.key);
    if (!target || !entry) return;
    const rect = target.getBoundingClientRect();
    const start = Math.min(1380 - drag.duration, 360 + Math.max(0, Math.min(33, Math.floor((event.clientY - rect.top) / (rect.height / 34)))) * 30);
    gestureSave(entry, target.getAttribute('data-calendar-day'), start, drag.duration, drag.expected);
  };
  const dragHandle = entry => !isMobile && !blocked(entry) ? <button type="button" className="task-calendar-drag-handle" aria-label={`Drag ${entry.todo.title} to a time slot`} onPointerDown={event => startPointerDrag(event, entry)} onPointerMove={movePointerDrag} onPointerUp={finishPointerDrag} onPointerCancel={() => { pointerDrag.current = null; setDropDay(''); }} onLostPointerCapture={() => { pointerDrag.current = null; setDropDay(''); }} title="Drag to a time slot">⠿</button> : null;
  const startResize = (event, entry) => {
    if (blocked(entry) || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    resizeClick.current = false;
    resizing.current = { key: taskViewIdentity(entry.todo), pointer: event.pointerId, y: event.clientY, day: entry.day, start: entry.start, duration: entry.duration, expected: preferenceSnapshot(prefFor(entry)), half: event.currentTarget.closest('.task-calendar-day').getBoundingClientRect().height / 34 };
  };
  const finishResize = event => {
    const gesture = resizing.current; resizing.current = null;
    setResizePreview(null);
    if (!gesture || gesture.pointer !== event.pointerId) return;
    const entry = latest.current.entries.find(item => taskViewIdentity(item.todo) === gesture.key); if (!entry) return;
    const duration = Math.max(30, Math.min(1380 - gesture.start, gesture.duration + Math.round((event.clientY - gesture.y) / gesture.half) * 30));
    if (duration === gesture.duration) return;
    resizeClick.current = true;
    gestureSave(entry, gesture.day, gesture.start, duration, gesture.expected);
  };
  const moveResize = event => { const gesture = resizing.current; if (gesture?.pointer !== event.pointerId) return; setResizePreview({ key: gesture.key, duration: Math.max(30, Math.min(1380 - gesture.start, gesture.duration + Math.round((event.clientY - gesture.y) / gesture.half) * 30)) }); };
  if (!enabled) return null;
  if (!plan.ready) return <section className="task-calendar" aria-label="Personal task calendar"><p role={plan.error ? 'alert' : 'status'}>{plan.error || 'Loading your personal calendar…'}</p></section>;
  return <section className="task-calendar" aria-label="Personal task calendar">
    <div className="task-calendar-toolbar"><div className="task-calendar-navigation"><button type="button" aria-label="Previous week" onClick={() => chooseDay(shiftCalendarDay(selectedDay, -7))}>‹</button><button type="button" onClick={() => { setRange('week'); chooseDay(today); }}>Today</button><button type="button" aria-label="Next week" onClick={() => chooseDay(shiftCalendarDay(selectedDay, 7))}>›</button><strong>{calendarDayLabel(week[0])} – {calendarDayLabel(week[6])}</strong></div><div className="task-calendar-range"><span>Local time · 30-minute slots</span><button type="button" aria-pressed={range === 'week'} onClick={() => setRange('week')}>Week</button><button type="button" aria-pressed={range === 'weekend'} onClick={() => { setRange('weekend'); chooseDay(week[5]); }}>Weekend</button></div></div>
    {!plan.calendarReady ? <div role={plan.calendarError ? 'alert' : 'status'} className="task-calendar-storage"><p>{plan.calendarError || (plan.offline ? 'Reconnect to check Calendar storage. Confirmed placements are retained.' : 'Checking Calendar storage…')}</p><button type="button" disabled={plan.offline} onClick={plan.reloadCalendar}>Retry Calendar</button></div> : null}
    {plan.offline ? <p role="status">Offline · Reconnect to move tasks. Confirmed placements are shown.</p> : null}
    {plan.error ? <p role="alert">{plan.error}</p> : null}
    <div className="task-calendar-instructions">Drag a task onto the calendar, or select it to choose a time. Scheduling never changes its deadline.</div>
    {isMobile ? <nav className="task-calendar-day-strip" aria-label="Choose calendar day">{week.map(day => <button type="button" key={day} aria-pressed={day === selectedDay} onClick={() => chooseDay(day)}>{calendarDayLabel(day)}</button>)}</nav> : null}
    <div className="task-calendar-layout">
      <div className="task-calendar-grid" style={{ '--calendar-columns': days.length }}>
        <div className="task-calendar-corner">Time</div>{days.map(day => <button type="button" className="task-calendar-day-heading" key={day} aria-pressed={day === selectedDay} onClick={() => chooseDay(day)}>{calendarDayLabel(day)}</button>)}
        <div className="task-calendar-time-rail">{Array.from({ length: 18 }, (_, index) => <span key={index} style={{ top: `${index / 17 * 100}%` }}>{calendarTime(360 + index * 60)}</span>)}</div>
        {days.map(day => <div key={day} data-calendar-day={day} aria-label={`${calendarDayLabel(day)} time slots`} className={`task-calendar-day ${dropDay === day ? 'is-drop-target' : ''}`} onDragOver={event => { if (dragged.current) { event.preventDefault(); setDropDay(day); } }} onDragLeave={() => setDropDay('')} onDrop={event => drop(event, day)}>
          {layoutCalendarDay(allEntries.filter(entry => entry.day === day)).filter(entry => entries.some(visible => taskViewIdentity(visible.todo) === taskViewIdentity(entry.todo))).map(entry => {
            const identity = taskViewIdentity(entry.todo), clash = clashText(entry), passed = calendarTimePassed(entry, now);
            return <div key={identity} className={`task-calendar-block ${clash ? 'has-clash' : ''}`} style={{ top: `${(entry.start - 360) / 1020 * 100}%`, height: `${(resizePreview?.key === identity ? resizePreview.duration : entry.duration) / 1020 * 100}%`, left: `calc(${entry.lane / entry.lanes * 100}% + 2px)`, width: `calc(${100 / entry.lanes}% - 4px)` }}>
              <button type="button" draggable={!isMobile && !blocked(entry)} onDragStart={event => startDrag(event, entry)} onDragEnd={() => { dragged.current = null; setDropDay(''); }} onClick={() => open(entry)} aria-label={`${entry.todo.title}, ${calendarDayLabel(entry.day)}, ${calendarTime(entry.start)}–${calendarTime(entry.start + entry.duration)}${clash ? `, ${clash}` : ''}${passed ? ', Time passed · Not completed' : ''}`} title={`${entry.todo.title} · ${entry.todo.projectName || 'Other'} · ${deadlineDescription(entry.todo, today)}${clash ? ` · ${clash}` : ''}${passed ? ' · Time passed · Not completed' : ''}`}><span>{clash ? '⚠ ' : ''}{entry.todo.title || 'Untitled'}</span>{entry.duration >= 60 ? <small>{calendarTime(entry.start)}–{calendarTime(entry.start + entry.duration)}</small> : null}{passed && entry.duration >= 90 ? <small>Time passed · Not completed</small> : null}</button>
              {dragHandle(entry)}
              <button type="button" className="task-calendar-resize" aria-label={`Resize ${entry.todo.title}`} disabled={blocked(entry)} onPointerDown={event => startResize(event, entry)} onPointerMove={moveResize} onPointerUp={finishResize} onPointerCancel={() => { resizing.current = null; setResizePreview(null); }} onClick={() => { if (resizeClick.current) { resizeClick.current = false; return; } open(entry); }} title="Drag to resize, or select to edit duration">━</button>
            </div>;
          })}
        </div>)}
      </div>
      <aside className="task-calendar-pool" aria-label="Selected day task pool"><h3>{calendarDayLabel(selectedDay)}</h3><p>{pool.length} task{pool.length === 1 ? '' : 's'} · Times stay visible here</p>
        {pool.map(entry => { const clash = clashText(entry), passed = calendarTimePassed(entry, now); return <div className="task-calendar-pool-row" key={taskViewIdentity(entry.todo)}>
          {dragHandle(entry)}
          <button type="button" className="task-calendar-pool-task" draggable={!isMobile && !blocked(entry)} onDragStart={event => startDrag(event, entry)} onDragEnd={() => { dragged.current = null; setDropDay(''); }} onClick={() => open(entry)}><strong>{entry.todo.title || 'Untitled'}</strong><span>{entry.todo.projectName || 'Other'}</span><span className={entry.start === null ? '' : 'task-calendar-reserved'}>{entry.start === null ? 'Choose a time' : `${calendarTime(entry.start)}–${calendarTime(entry.start + entry.duration)}`}</span><span className={entry.todo.dueDate && entry.todo.dueDate < today ? 'task-overdue' : ''}>{deadlineDescription(entry.todo, today)}</span>{clash ? <span className="task-calendar-clash">⚠ {clash}</span> : null}{passed ? <span>Time passed · Not completed</span> : null}</button>
          <button type="button" className="task-calendar-complete" aria-label={`Complete ${entry.todo.title}`} disabled={blocked(entry)} onClick={() => handleCompleteTodo(entry.todo, `calendar:${entry.day}`, 0)}>✓</button>
        </div>; })}
        {!pool.length ? <p>No tasks planned or due on this day.</p> : null}
        {transientTodos.filter(entry => entry.bucketKey === `calendar:${selectedDay}`).map(entry => <button key={taskViewIdentity(entry.todo)} type="button" onClick={() => handleCompleteTodo(entry.todo, entry.bucketKey, 0)}>Undo completion for {entry.todo.title}</button>)}
      </aside>
    </div>
    <p className="task-calendar-notice" role="status" aria-live="polite">{notice}</p>
    {enabled && editorEntry && drafts[editorKey] ? <CalendarEditor todo={editorEntry.todo} draft={drafts[editorKey]} today={today} disabled={blocked(editorEntry)} canRemove={editorEntry.start !== null}
      onChange={patch => updateDraft(editorKey, patch)} onClose={() => setEditorKey(null)} onSave={() => void save(editorEntry, drafts[editorKey])} onRemove={() => void save(editorEntry, drafts[editorKey], true)}
      onOpenTodo={() => { setEditorKey(null); onOpenTodo(editorEntry.todo); }} onReload={plan.reloadCalendar}
      onReview={() => { const snapshot = preferenceSnapshot(prefFor(editorEntry)); updateDraft(editorKey, { expected: snapshot, reviewed: `${snapshot.day || 'no personal day'}${snapshot.start === null ? ' · no reserved time' : ` · ${calendarTime(snapshot.start)}–${calendarTime(snapshot.start + snapshot.duration)}`}`, error: '' }); }} /> : null}
  </section>;
}
