import React from 'react';
import { parseDateValue } from '../utils/helpers';

export default function TaskEditorDateField({ label, ariaLabel, value, onChange, emptyLabel = 'Choose date', inputRef }) {
  const date = parseDateValue(value);
  const display = date ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : emptyLabel;
  return <label className="task-editor-date-field">
    <span>{label}</span>
    <span className="task-editor-date-control">
      <span className="task-editor-date-face" aria-hidden="true">
        <span>{display}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
      </span>
      <input ref={inputRef} type="date" aria-label={ariaLabel} value={value} onChange={onChange} />
    </span>
  </label>;
}
