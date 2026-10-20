import React, { useRef, useState } from 'react';
import CareDialog from './CareDialog';
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
  const pending = useRef(false);
  const busy = disabled || saving;
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
  return <CareDialog title={entry ? 'Edit sleep' : 'Add sleep'} onClose={onClose} busy={busy}>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(false); }}>
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
  </CareDialog>;
}
