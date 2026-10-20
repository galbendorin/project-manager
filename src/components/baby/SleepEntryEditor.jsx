import React, { useEffect, useRef, useState } from 'react';
import { sleepMinuteToTime, sleepTimeToMinute, validateSleepEntry } from '../../utils/babySleepEntries';

const fieldClass = 'pm-input mt-1 min-h-[48px] w-full min-w-0 rounded-xl px-3 text-[16px]';
const initialDraft = (entry, dateKey) => entry ? { ...entry } : {
  id: crypto.randomUUID(), sleepDate: dateKey, startMinute: 960, endMinute: 990, notes: '',
};

export default function SleepEntryEditor({ entry, dateKey, onSave, onClose, disabled = false }) {
  const [draft, setDraft] = useState(() => initialDraft(entry, dateKey));
  const [start, setStart] = useState(() => sleepMinuteToTime(draft.startMinute));
  const [end, setEnd] = useState(() => sleepMinuteToTime(draft.endMinute));
  const [nextDay, setNextDay] = useState(draft.endMinute >= 1440);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false), panel = useRef(null);
  const busy = disabled || saving;
  const busyRef = useRef(busy); busyRef.current = busy;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('input')?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); if (!busyRef.current) closeRef.current(); }
      if (event.key !== 'Tab') return;
      const targets = [...(panel.current?.querySelectorAll('input:not(:disabled),textarea:not(:disabled),button:not(:disabled)') || [])];
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus?.(); };
  }, []);
  const submit = async archive => {
    if (busy || pending.current) return;
    setError(''); setLatest(null);
    let value;
    try {
      value = validateSleepEntry({ ...draft, startMinute: sleepTimeToMinute(start), endMinute: sleepTimeToMinute(end) + (nextDay ? 1440 : 0) });
    } catch (failure) { setError(failure.message); return; }
    const next = { ...draft, ...value, ...(archive ? { archiveRequestedAt: draft.archiveRequestedAt || new Date().toISOString() } : {}) };
    setDraft(next); pending.current = true; setSaving(true);
    try { await onSave(next, archive); onClose(); }
    catch (failure) { setError(failure?.message || 'Unable to save. Your times and note are kept.'); setLatest(failure.latest || null); }
    finally { pending.current = false; setSaving(false); }
  };
  const reviewLatest = () => {
    setDraft(latest); setStart(sleepMinuteToTime(latest.startMinute)); setEnd(sleepMinuteToTime(latest.endMinute));
    setNextDay(latest.endMinute >= 1440); setLatest(null); setError('Latest saved entry loaded. Review it before saving.');
  };
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-2 sm:items-center sm:p-6">
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="sleep-entry-title" className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><h2 id="sleep-entry-title" className="text-lg font-bold text-slate-950">{entry ? 'Edit sleep' : 'Add sleep'}</h2><button type="button" disabled={busy} onClick={onClose} className="min-h-[44px] rounded-xl border px-3 font-semibold">Cancel</button></header>
      <form className="space-y-4 overflow-y-auto p-4" onSubmit={event => { event.preventDefault(); void submit(false); }}>
        <p className="text-sm text-slate-600">Record exact times and keep a note for later.</p>
        <label className="block text-sm font-semibold text-slate-700">Sleep date<input type="date" required disabled={busy} value={draft.sleepDate} onInput={event => setDraft({ ...draft, sleepDate: event.target.value })} onChange={event => setDraft({ ...draft, sleepDate: event.target.value })} className={fieldClass} /></label>
        <div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-sm font-semibold text-slate-700">Start<input type="time" step="60" required disabled={busy} value={start} onInput={event => setStart(event.target.value)} onChange={event => setStart(event.target.value)} className={fieldClass} /></label><label className="min-w-0 text-sm font-semibold text-slate-700">End<input type="time" step="60" required disabled={busy} value={end} onInput={event => setEnd(event.target.value)} onChange={event => setEnd(event.target.value)} className={fieldClass} /></label></div>
        <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-700"><input type="checkbox" disabled={busy} checked={nextDay} onChange={event => setNextDay(event.target.checked)} className="h-5 w-5" />Ends next day</label>
        <label className="block text-sm font-semibold text-slate-700">Note · optional<textarea rows={3} maxLength={2000} disabled={busy} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="What affected sleep? For example, woke during a journey." className={`${fieldClass} py-3 font-normal`} /></label>
        <p className="text-xs leading-5 text-slate-500">Exact entries stay separate from the 15-minute grid. Overlapping time counts once; grid marks may extend an exact entry’s start or end. Remove those marks in the grid to correct an estimate.</p>
        {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {latest ? <button type="button" onClick={reviewLatest} className="min-h-[44px] rounded-xl border px-3 font-semibold">Review saved entry</button> : null}
        <button type="submit" disabled={busy || Boolean(latest) || Boolean(draft.archivedAt)} className="pm-toolbar-primary min-h-[48px] w-full rounded-xl px-4 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save sleep entry'}</button>
        {entry && !draft.archivedAt ? <button type="button" disabled={busy || Boolean(latest)} onClick={() => void submit(true)} className="min-h-[44px] rounded-xl px-3 font-semibold text-rose-700">Remove sleep entry</button> : null}
      </form>
    </section>
  </div>;
}
