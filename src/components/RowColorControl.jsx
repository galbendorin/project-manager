import React from 'react';
import { ROW_COLOR_OPTIONS, getRowColorMeta } from '../utils/rowColors';

const DefaultSwatch = () => (
  <span className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white">
    <span className="absolute h-px w-3 rotate-45 bg-slate-400" />
  </span>
);

export default function RowColorControl({
  value = null,
  onChange,
  mode = 'compact',
  className = '',
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      {ROW_COLOR_OPTIONS.map((option) => {
        const selected = (value || null) === option.value;
        const meta = getRowColorMeta(option.value);

        if (mode === 'pills') {
          return (
            <button
              key={option.value || 'default'}
              type="button"
              onClick={() => onChange(option.value)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                selected
                  ? 'border-slate-900 text-slate-900 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
              style={selected && meta ? {
                backgroundColor: meta.background,
                borderColor: meta.border,
              } : undefined}
              title={option.label}
              aria-label={`Set row color to ${option.label}`}
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200"
                style={meta ? { backgroundColor: meta.dot, borderColor: meta.border } : undefined}
              >
                {meta ? null : <DefaultSwatch />}
              </span>
              <span>{option.label}</span>
            </button>
          );
        }

        return (
          <button
            key={option.value || 'default'}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
              selected
                ? 'scale-110 border-slate-700 shadow-sm'
                : 'border-slate-200 hover:border-slate-400'
            }`}
            style={meta ? { backgroundColor: meta.dot, borderColor: selected ? meta.dot : meta.border } : undefined}
            title={option.label}
            aria-label={`Set row color to ${option.label}`}
          >
            {meta ? null : <DefaultSwatch />}
          </button>
        );
      })}
    </div>
  );
}
