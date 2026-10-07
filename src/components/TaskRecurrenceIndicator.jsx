import React from 'react';
const PATTERNS = { weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
export function taskRepeatLabel(recurrence) {
  const type = String(recurrence?.type || '').toLowerCase();
  return Object.hasOwn(PATTERNS, type) ? PATTERNS[type] : '';
}
export default function TaskRecurrenceIndicator({ recurrence, compact = false }) {
  const label = taskRepeatLabel(recurrence);
  if (!label) return null;
  return <span className="task-repeat" title={`Repeats ${label.toLowerCase()}`} aria-label={`Repeats ${label.toLowerCase()}`}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6M4 16a8 8 0 0 0 14 2l3-3m0 6v-6h-6" /></svg>
    <span className={compact ? 'task-repeat-label' : ''}>{label}</span>
  </span>;
}
