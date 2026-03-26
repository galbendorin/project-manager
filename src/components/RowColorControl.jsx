import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const normalizedValue = value || null;

  useEffect(() => {
    if (mode !== 'compact' || !open) return undefined;

    const handleClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mode, open]);

  const selectedMeta = getRowColorMeta(normalizedValue);
  const compactOptions = useMemo(
    () => ROW_COLOR_OPTIONS.filter((option) => option.value !== normalizedValue),
    [normalizedValue]
  );

  return (
    <div
      ref={rootRef}
      className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}
    >
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

        return null;
      })}

      {mode === 'compact' && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white transition hover:border-slate-500"
            style={selectedMeta ? {
              backgroundColor: selectedMeta.dot,
              borderColor: selectedMeta.border,
            } : undefined}
            title="Row color"
            aria-label="Choose row color"
            aria-expanded={open}
          >
            {selectedMeta ? null : <DefaultSwatch />}
          </button>

          {open && (
            <div className="absolute left-1/2 top-full z-20 mt-2 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-2 shadow-xl">
              {compactOptions.map((option) => {
                const meta = getRowColorMeta(option.value);
                return (
                  <button
                    key={option.value || 'default'}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:scale-110 hover:border-slate-500"
                    style={meta ? { backgroundColor: meta.dot, borderColor: meta.border } : undefined}
                    title={option.label}
                    aria-label={`Set row color to ${option.label}`}
                  >
                    {meta ? null : <DefaultSwatch />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
