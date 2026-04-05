import React, { useEffect, useRef, useState } from 'react';
import { getMultiFilterSummary, toggleMultiFilterValue } from '../utils/todoFilterUtils';

export default function TodoMultiSelectFilter({
  allLabel,
  options,
  selectedValues,
  onChange,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-left text-slate-700 flex items-center justify-between gap-2 hover:border-slate-300 transition-colors"
      >
        <span className="truncate">{getMultiFilterSummary(selectedValues, options, allLabel)}</span>
        <span className={`text-[10px] text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-2 w-full min-w-[220px] rounded-xl border border-slate-200 bg-white shadow-lg p-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-left px-2.5 py-2 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg"
          >
            Clear selection
          </button>
          <div className="px-2.5 pt-1 pb-2 text-[10px] text-slate-400">
            Tap a name to show only that option, or use checkboxes to combine filters.
          </div>
          <div className="mt-1 max-h-64 overflow-y-auto space-y-1">
            {options.map((option) => {
              const checked = selectedValues.includes(option.value);
              return (
                <div
                  key={option.value}
                  className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onChange(toggleMultiFilterValue(selectedValues, option.value))}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={`Include ${option.label}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onChange([option.value]);
                      setIsOpen(false);
                    }}
                    className="flex-1 truncate text-left"
                    aria-label={`Show only ${option.label}`}
                  >
                    {option.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
