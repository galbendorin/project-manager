import React, { useMemo } from 'react';
import { buildProjectNowSummary } from '../utils/projectNowSummary';

const RAG_CLASSES = {
  Green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Amber: 'border-amber-200 bg-amber-50 text-amber-700',
  Red: 'border-rose-200 bg-rose-50 text-rose-700',
};

const trimLabel = (value = '', maxLength = 34) => {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};

export default function ProjectNowSummary({
  tasks,
  registers,
  tracker,
  statusReport,
  todos,
}) {
  const summary = useMemo(() => buildProjectNowSummary({
    tasks,
    registers,
    tracker,
    statusReport,
    todos,
  }), [tasks, registers, tracker, statusReport, todos]);

  const ragClasses = RAG_CLASSES[summary.rag] || RAG_CLASSES.Green;

  return (
    <div className="border-b border-slate-200 bg-white/88 backdrop-blur">
      <div className="px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Now
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${ragClasses}`}>
            {summary.rag}
          </span>
          {summary.attentionCount > 0 ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
              {summary.attentionCount} attention
            </span>
          ) : null}
          {summary.overdueCount > 0 ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              {summary.overdueCount} overdue
            </span>
          ) : summary.dueSoonCount > 0 ? (
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              {summary.dueSoonCount} due this week
            </span>
          ) : null}
          {summary.nextItem?.title ? (
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              Next: {trimLabel(summary.nextItem.title)}
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-sm font-medium text-slate-700">
          {summary.summaryLine}
        </p>

        {summary.narrative ? (
          <p className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">
            {summary.narrative}
          </p>
        ) : null}
      </div>
    </div>
  );
}
