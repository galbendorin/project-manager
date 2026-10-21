import React, { useRef, useState } from 'react';
import { getSleepBlockTimeLabel, getSleepGuidanceBlockStatus } from '../../utils/babyTracker';

const time = minute => minute === 1440 ? '24:00' : String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
const windowStart = hour => Math.max(0, Math.min(21, hour));
export default function PhoneSleepPicker({ asleepSet, onToggle, disabled = false, sleepGuidance = null, initialHour }) {
  const [hour, setHour] = useState(() => windowStart(initialHour ?? Math.floor(([...asleepSet].sort((a, b) => a - b)[0] ?? 32) / 4)));
  const picker = useRef(null);
  return <div className="mt-3 space-y-3">
    <div ref={picker} className="rounded-xl bg-slate-50 p-3">
      <label className="flex flex-wrap items-center justify-between gap-2 text-[14px] font-semibold text-slate-700">Three-hour window
        <select aria-label="Sleep window" disabled={disabled} value={hour} onChange={event => setHour(windowStart(Number(event.target.value)))} className="pm-input min-h-[44px] min-w-0 rounded-xl bg-white px-3 text-[16px]">{Array.from({ length: 22 }, (_, index) => <option key={index} value={index}>{time(index * 60)}–{time((index + 3) * 60)}</option>)}</select>
      </label>
      <p className="my-2 text-[13px] leading-5 text-slate-600">Each button is 15 minutes. Tap once to change it; tap again to undo.</p>
      <div className="space-y-3">{[hour, hour + 1, hour + 2].map(row => <div key={row}>
        <p className="mb-1 text-[13px] font-semibold tabular-nums text-slate-600">{time(row * 60)}–{time((row + 1) * 60)}</p>
        <div className="grid grid-cols-4 gap-1.5">{[0, 1, 2, 3].map(quarter => {
          const index = row * 4 + quarter, asleep = asleepSet.has(index);
          return <button key={index} type="button" disabled={disabled} data-sleep-block-index={index} aria-label={getSleepBlockTimeLabel(index) + (asleep ? ' asleep' : ' awake')} aria-pressed={asleep} onClick={() => onToggle(index)} className={'min-h-[52px] min-w-0 rounded-xl border px-1 py-2 text-[14px] font-semibold tabular-nums disabled:opacity-50 ' + (asleep ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-300 bg-white text-slate-700')}><span className="block">{time(index * 15)}</span><span className="mt-0.5 block text-[12px]">{asleep ? 'Asleep' : 'Awake'}</span></button>;
        })}</div>
      </div>)}</div>
    </div>
    <details className="rounded-xl border border-slate-200 px-3"><summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-semibold text-slate-600">24-hour overview <span aria-hidden="true">⌄</span></summary><p className="mb-2 text-[13px] text-slate-500">Tap an hour to show its three-hour window.</p><div className="mb-3 grid grid-cols-4 gap-1.5">{Array.from({ length: 24 }, (_, index) => <button key={index} type="button" disabled={disabled} aria-label={'Edit hour ' + time(index * 60)} aria-pressed={index >= hour && index < hour + 3} onClick={() => { setHour(windowStart(index)); picker.current?.scrollIntoView?.({ block: 'nearest' }); }} className={'min-h-[52px] min-w-0 rounded-lg border p-1.5 ' + (index >= hour && index < hour + 3 ? 'border-sky-600 bg-sky-50' : 'border-slate-200 bg-slate-50')}><span className="block text-[12px] font-semibold text-slate-700">{time(index * 60)}</span><span className="mt-1 grid grid-cols-4 gap-0.5" aria-hidden="true">{[0, 1, 2, 3].map(quarter => <span key={quarter} className={'h-2.5 rounded-sm ' + (asleepSet.has(index * 4 + quarter) ? 'bg-sky-700' : getSleepGuidanceBlockStatus(index * 4 + quarter, sleepGuidance) === 'expected' ? 'bg-sky-200' : getSleepGuidanceBlockStatus(index * 4 + quarter, sleepGuidance) === 'flexible' ? 'bg-orange-200' : 'bg-white')} />)}</span></button>)}</div></details>
  </div>;
}
