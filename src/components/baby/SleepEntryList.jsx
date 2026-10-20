import React from 'react';
import { formatBabyDisplayDate } from '../../utils/babyTracker';
import { sleepMinuteToTime } from '../../utils/babySleepEntries';

export default function SleepEntryList({ entries, onEdit, disabled = false, title = 'Exact sleep & notes' }) {
  return <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-3 sm:p-4" aria-label={title}>
    <h3 className="text-sm font-bold text-slate-900">{title}</h3>
    <p className="mt-1 text-xs leading-5 text-slate-500">Totals combine exact entries and grid estimates. Overlapping time counts once.</p>
    {entries.length ? <ul className="mt-2 divide-y divide-violet-100">{[...entries].sort((a, b) => a.sleepDate.localeCompare(b.sleepDate) || a.startMinute - b.startMinute).map(entry => <li key={entry.id} className="py-3">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{formatBabyDisplayDate(entry.sleepDate)}</p><p className="mt-1 text-[15px] font-bold tabular-nums text-violet-900">{sleepMinuteToTime(entry.startMinute)}–{sleepMinuteToTime(entry.endMinute)}{entry.endMinute >= 1440 ? ' (+1 day)' : ''}<span className="ml-2 text-xs font-medium text-slate-600">{entry.endMinute - entry.startMinute} min</span></p></div><button type="button" disabled={disabled} onClick={() => onEdit(entry)} aria-label={`Edit sleep ${entry.sleepDate} ${sleepMinuteToTime(entry.startMinute)}`} className="min-h-[44px] shrink-0 rounded-xl border border-violet-200 bg-white px-3 text-sm font-semibold text-violet-700 disabled:opacity-40">Edit</button></div>
      {entry.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{entry.notes}</p> : <p className="mt-1 text-xs text-slate-400">No note added.</p>}
    </li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No exact entries for these dates. Use Add sleep to record times and a note.</p>}
  </section>;
}
