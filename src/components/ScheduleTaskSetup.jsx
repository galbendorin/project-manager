import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPromotionPreview, promotionIntent } from '../utils/taskPlanPromotion';
import { getCurrentDate, getFinishDate, formatDate as formatDisplayDate } from '../utils/helpers';
import { linkedTaskFromPromotionSnapshot, promotionSourceLink } from '../hooks/projectData/taskPlanTransactions';

const fieldClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900';
const ScheduleTaskSetup = ({ reference, title, onPrepare, onCommit, onClose, onSaved, returning = false }) => {
  const [draft, setDraft] = useState({ name: title || '', type: 'Task', start: getCurrentDate(), duration: '', dependencyChoice: '', dependencies: [], depLogic: 'ALL' });
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState(null);
  const attemptRejected = useRef(false);
  const alive = useRef(true);
  const dialog = useRef(null);
  const loadEpoch = useRef(0);
  const preparing = useRef(onPrepare); preparing.current = onPrepare;
  const close = useRef(onClose); close.current = onClose;
  const savingRef = useRef(saving); savingRef.current = saving;
  const loadLatest = async (adoptLatest = false) => {
    const epoch = ++loadEpoch.current;
    setLoading(true); setError('');
    try {
      const next = await preparing.current(reference, { adoptLatest });
      if (!alive.current || epoch !== loadEpoch.current) return;
      const linkedTask = linkedTaskFromPromotionSnapshot({ ...next, reference });
      setSnapshot(next);
      if (adoptLatest) setConfirmed(false);
      // A lost-response save is resolved by the authoritative existing link.
      if (!returning && linkedTask) { onSaved({ task_id: linkedTask.id }); return; }
      if (returning && !promotionSourceLink(next.source, reference.kind)) {
        const receipt = reference.kind === 'manual' ? next.source.meta?.projectPlanLastReturn : next.source.projectPlanLastReturn;
        if (receipt?.operationId === attempt?.operationId) { onSaved({ task_id: receipt.link?.taskId }); return; }
        setError('This item is no longer linked to Project Plan. Close this setup and check its source.');
      }
      // A fresh unlocked read cannot prove that a timed-out transaction has
      // stopped. Keep its original UUID/payload until the server rejects it or
      // the matching saved link/return receipt resolves it.
      if (!attempt || attemptRejected.current) { setAttempt(null); attemptRejected.current = false; }
      else setError('The previous save is still unconfirmed. Retry the same save before changing its inputs.');
    } catch (failure) { if (alive.current && epoch === loadEpoch.current) setError(failure.message); }
    finally { if (alive.current && epoch === loadEpoch.current) setLoading(false); }
  };
  useEffect(() => {
    alive.current = true; void loadLatest();
    return () => { alive.current = false; loadEpoch.current += 1; };
    // The parent keys this component by owner/project/source/operation mode.
    // Refresh explicitly; callback identity changes must not reset typed fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    const keys = (event) => {
      if (event.key === 'Escape' && !savingRef.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...(dialog.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])') || [])];
      if (!nodes.length) return;
      const first = nodes[0]; const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('keydown', keys); previous?.focus?.(); };
  }, []);
  const preview = useMemo(() => {
    if (!snapshot || returning) return { value: null, message: '' };
    try { return { value: buildPromotionPreview(snapshot.project.tasks || [], draft), message: '' }; }
    catch (failure) { return { value: null, message: failure.message }; }
  }, [snapshot, draft, returning]);
  const link = promotionSourceLink(snapshot?.source, reference.kind);
  const currentTask = snapshot?.project.tasks?.find((task) => task.id === link?.taskId);
  const originalDeadline = reference.kind === 'manual' ? snapshot?.source.due_date : reference.kind === 'action' ? snapshot?.source.target : snapshot?.source.dueDate;
  const changedDeadline = Boolean(originalDeadline && preview.value && originalDeadline !== preview.value.finish);
  const change = (key, value) => { setDraft((current) => ({ ...current, [key]: value })); setConfirmed(false); setError(''); };
  const submit = async () => {
    if (saving || loading || !snapshot || (!attempt && !returning && (!preview.value || (changedDeadline && !confirmed)))) return;
    const operation = attempt || { snapshot, reference, operationId: crypto.randomUUID(), returning, ...(!returning ? { intent: promotionIntent(reference, snapshot.projectId, draft, preview.value) } : {}) };
    setAttempt(operation); setSaving(true); setError('');
    try { const ack = await onCommit({ ...operation, replay: Boolean(attempt) }); if (alive.current) onSaved(ack); }
    catch (failure) { if (alive.current) { attemptRejected.current = failure.transactionRejected === true; setError(failure.message || 'Unable to save. Your inputs are retained.'); } }
    finally { if (alive.current) setSaving(false); }
  };
  const locked = loading || saving || Boolean(attempt);
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="schedule-source-title" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b p-4 sm:p-6"><h2 id="schedule-source-title" className="text-lg font-bold">{returning ? 'Return to original source' : 'Schedule this task'}</h2><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-3 py-2">Close</button></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <p className="text-sm text-slate-600">{returning ? 'Keep the latest scheduled title, deadline and status on the original work item. Its notes, checklist and personal priorities stay with it.' : 'The original task and its checklist stay linked. Project Plan will control its title, deadline and completion.'}</p>
        {loading ? <p role="status">Loading the current source and project…</p> : null}
        {returning ? <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-medium">{currentTask?.name || title}</p>{currentTask ? <><p>Retained deadline: <strong>{formatDisplayDate(getFinishDate(currentTask.start, currentTask.dur || 0))}</strong></p><p>Retained status: <strong>{Number(currentTask.pct) >= 100 ? 'Completed' : Number(currentTask.pct) > 0 ? 'In progress' : 'Not started'}</strong> ({Number(currentTask.pct) || 0}%)</p></> : null}</div> : <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
          <label className="block text-sm font-semibold">Task title<input className={fieldClass} value={draft.name} onChange={(event) => change('name', event.target.value)} /></label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Type<select className={fieldClass} value={draft.type} onChange={(event) => { change('type', event.target.value); change('duration', event.target.value === 'Milestone' ? '0' : ''); }}><option>Task</option><option>Milestone</option></select></label>
            <label className="block text-sm font-semibold">Duration (working days)<input className={fieldClass} type="number" min={draft.type === 'Milestone' ? 0 : 1} max="10000" step="1" disabled={draft.type === 'Milestone'} value={draft.duration} onChange={(event) => change('duration', event.target.value)} /></label>
          </div>
          <label className="block text-sm font-semibold">Start date<input className={fieldClass} type="date" value={draft.start} onChange={(event) => change('start', event.target.value)} /></label>
          <label className="block text-sm font-semibold">Dependency decision<select className={fieldClass} value={draft.dependencyChoice} onChange={(event) => change('dependencyChoice', event.target.value)}><option value="">Choose explicitly…</option><option value="independent">Independent — no predecessor</option><option value="dependent">Depends on other tasks</option></select></label>
          {draft.dependencyChoice === 'dependent' ? <div className="space-y-3">
            {draft.dependencies.map((dependency, index) => <div key={index} className="flex flex-wrap gap-2">
              <label className="min-w-0 flex-1 text-sm">Predecessor<select className={fieldClass} value={dependency.parentId} onChange={(event) => change('dependencies', draft.dependencies.map((item, at) => at === index ? { ...item, parentId: event.target.value } : item))}><option value="">Select a task…</option>{snapshot?.project.tasks?.map((task) => <option key={task.id} value={task.id}>{task.id}: {task.name}</option>)}</select></label>
              <label className="text-sm">Dependency type<select className={fieldClass} value={dependency.depType} onChange={(event) => change('dependencies', draft.dependencies.map((item, at) => at === index ? { ...item, depType: event.target.value } : item))}>{['FS', 'SS', 'FF', 'SF'].map((type) => <option key={type}>{type}</option>)}</select></label>
              <button type="button" className="self-end rounded-xl border p-3" onClick={() => change('dependencies', draft.dependencies.filter((_item, at) => at !== index))} aria-label={`Remove predecessor ${index + 1}`}>Remove</button>
            </div>)}
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => change('dependencies', [...draft.dependencies, { parentId: '', depType: 'FS' }])}>Add predecessor</button>
            <label className="block text-sm">Multiple predecessor rule<select className={fieldClass} value={draft.depLogic} onChange={(event) => change('depLogic', event.target.value)}><option value="ALL">ALL — wait for every predecessor</option><option value="ANY">ANY — earliest allowed start</option></select></label>
          </div> : null}
        </fieldset>}
        {originalDeadline ? <p className="text-sm">Original deadline: <strong>{formatDisplayDate(originalDeadline)}</strong></p> : null}
        {preview.value ? <p className="rounded-xl bg-indigo-50 p-3 text-sm">Scheduled start: <strong>{formatDisplayDate(preview.value.task.start)}</strong><br />Scheduled deadline: <strong>{formatDisplayDate(preview.value.finish)}</strong></p> : null}
        {attempt && !returning ? <p className="text-sm">Retry keeps the previously confirmed deadline: <strong>{formatDisplayDate(attempt.intent.confirmed_finish)}</strong>.</p> : changedDeadline ? <label className="flex gap-3 text-sm"><input type="checkbox" disabled={locked} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Use {formatDisplayDate(preview.value.finish)} as this task’s scheduled deadline.</span></label> : null}
        {!returning && preview.message && !loading ? <p className="text-sm text-slate-600">{preview.message}</p> : null}
        {error ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{error} Your inputs are retained.</p> : null}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
        <button type="button" disabled={saving || loading} onClick={() => loadLatest(true)} className="rounded-xl border px-3 py-3">Review latest</button>
        <button type="button" disabled={saving || loading || !snapshot || (!attempt && (returning ? !link : !preview.value || (changedDeadline && !confirmed)))} onClick={submit} className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : attempt ? 'Retry same save' : returning ? 'Return to source' : 'Save in Project Plan'}</button>
      </footer>
    </section>
  </div>;
};
export default ScheduleTaskSetup;
