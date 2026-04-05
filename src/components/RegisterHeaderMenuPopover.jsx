import React, { useEffect, useRef, useState } from 'react';

export default function RegisterHeaderMenuPopover({
  anchorRect,
  title,
  sortValue,
  sortOptions = [],
  filterValue = 'all',
  filterOptions = [],
  filterLabel = 'Filter',
  onSortChange,
  onFilterChange,
  onClose,
}) {
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRect || !popRef.current) return;
    const pop = popRef.current.getBoundingClientRect();
    const pad = 8;
    let top = anchorRect.bottom + 6;
    let left = anchorRect.left;

    if (left + pop.width > window.innerWidth - pad) {
      left = window.innerWidth - pop.width - pad;
    }
    if (left < pad) left = pad;

    if (top + pop.height > window.innerHeight - pad) {
      top = Math.max(pad, anchorRect.top - pop.height - 6);
    }

    setPos({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const handleClick = (event) => {
      if (popRef.current && !popRef.current.contains(event.target)) onClose();
    };

    document.addEventListener('keydown', handleEsc);
    document.addEventListener('mousedown', handleClick);

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  return (
    <div
      ref={popRef}
      className="fixed z-[9999] w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </div>

      {sortOptions.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-[11px] font-semibold text-slate-500">Sort</div>
          <div className="space-y-1">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onSortChange(option.value);
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors ${
                  sortValue === option.value
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{option.label}</span>
                {sortValue === option.value && <span className="text-indigo-600">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {filterOptions.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-2 text-[11px] font-semibold text-slate-500">{filterLabel}</div>
          <select
            value={filterValue}
            onChange={(event) => {
              onFilterChange(event.target.value);
              onClose();
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All</option>
            {filterOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
