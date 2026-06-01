import React from 'react';

const ChecklistIcon = ({ className = 'h-3.5 w-3.5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l2 2 4-5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5h14v14H5z" />
  </svg>
);

export default function TaskChecklistBadge({ summary, compact = false }) {
  if (!summary?.total) return null;

  const isComplete = summary.isComplete;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold ${
        compact ? 'text-[8px]' : 'text-[10px]'
      } ${
        isComplete
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}
      title={`${summary.completed}/${summary.total} checklist items`}
    >
      <ChecklistIcon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      <span>{summary.completed}/{summary.total}</span>
    </span>
  );
}
