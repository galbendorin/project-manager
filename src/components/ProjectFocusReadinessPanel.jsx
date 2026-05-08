import React, { useMemo } from 'react';
import { buildProjectReadiness } from '../utils/projectReadiness';

const checkStyle = (status) => (
  status === 'pass'
    ? { dot: 'bg-emerald-500', text: 'text-emerald-700' }
    : { dot: 'bg-amber-500', text: 'text-amber-700' }
);

const focusTone = (item) => {
  if (item.deltaDays !== null && item.deltaDays < 0) return 'border-rose-100 bg-rose-50 text-rose-700';
  if (item.deltaDays === 0) return 'border-indigo-100 bg-indigo-50 text-indigo-700';
  return 'border-slate-100 bg-slate-50 text-slate-600';
};

export default function ProjectFocusReadinessPanel({
  tasks,
  registers,
  tracker,
  statusReport,
  todos,
}) {
  const readiness = useMemo(() => buildProjectReadiness({
    tasks,
    registers,
    tracker,
    statusReport,
    todos,
  }), [tasks, registers, tracker, statusReport, todos]);

  return (
    <section className="border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur md:hidden">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today / Next 3</p>
          <h2 className="mt-0.5 text-sm font-black text-slate-900">Fastest work to pick up</h2>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${readiness.isReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {readiness.scoreLabel} ready
        </span>
      </div>

      {readiness.focusItems.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {readiness.focusItems.map((item) => (
            <div key={item.id} className="w-[78vw] max-w-[19rem] shrink-0 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
              <div className="mb-2 flex items-center gap-1.5">
                <span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black ${focusTone(item)}`}>
                  {item.dateLabel}
                </span>
                <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-slate-400">
                  {item.source}
                </span>
                {item.owner ? (
                  <span className="min-w-0 truncate text-[10px] font-semibold text-slate-400">{item.owner}</span>
                ) : null}
              </div>
              <p className="text-[13px] font-semibold leading-4 text-slate-800">{item.title}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          Add a dated task, action, or issue and it will appear here for quick follow-up.
        </div>
      )}

      <details className="mt-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
        <summary className="cursor-pointer text-xs font-black text-slate-700">
          Readiness check
        </summary>
        <div className="mt-2 grid gap-2">
          {readiness.checks.map((check) => {
            const style = checkStyle(check.status);
            return (
              <div key={check.key} className="rounded-lg bg-white px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                  <span className={`min-w-0 flex-1 text-[11px] font-bold ${style.text}`}>{check.label}</span>
                </div>
                <p className="mt-1 pl-4 text-[10px] leading-4 text-slate-500">{check.detail}</p>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
