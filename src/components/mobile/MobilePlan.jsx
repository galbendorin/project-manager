import React, { useState, useMemo } from 'react';
import TaskCard from './TaskCard';
import { buildVisibleTasks } from '../../utils/helpers';

const FILTERS = ['All', 'Active', 'Overdue', 'Milestones', 'Red/Amber'];

const MobilePlan = ({ tasks, onTaskTap, hasBaseline = false, onSetBaseline, onClearBaseline }) => {
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBaselineMenu, setShowBaselineMenu] = useState(false);

  const visibleTasks = useMemo(() => buildVisibleTasks(tasks, new Set()), [tasks]);

  const filteredTasks = useMemo(() => {
    let result = visibleTasks;

    // Apply filter
    if (filter === 'Active') result = result.filter(t => t.pct > 0 && t.pct < 100);
    else if (filter === 'Overdue') {
      const now = new Date();
      result = result.filter(t => t.finish && new Date(t.finish) < now && t.pct < 100);
    }
    else if (filter === 'Milestones') result = result.filter(t => t.type === 'Milestone');
    else if (filter === 'Red/Amber') result = result.filter(t => t.rag === 'red' || t.rag === 'amber');

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.owner || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [visibleTasks, filter, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {(onSetBaseline || (hasBaseline && onClearBaseline)) && (
        <div className="px-3 pt-2.5 pb-1.5">
          <button
            onClick={() => setShowBaselineMenu((prev) => !prev)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 ${
              hasBaseline
                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                : 'bg-slate-950 text-white shadow-sm'
            }`}
          >
            {hasBaseline ? <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> : <span>📏</span>}
            Baseline
            <span className="text-[9px]">▾</span>
          </button>

          {showBaselineMenu && (
            <div className="mt-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {!hasBaseline ? (
                <button
                  onClick={() => {
                    onSetBaseline?.();
                    setShowBaselineMenu(false);
                  }}
                  className="w-full px-4 py-3 text-left text-[11px] font-medium text-slate-700 active:bg-purple-50"
                >
                  <span className="block">Set baseline</span>
                  <span className="block mt-0.5 text-[10px] text-slate-400">Save the current project plan as the first snapshot</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      onSetBaseline?.();
                      setShowBaselineMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-[11px] font-medium text-slate-700 active:bg-purple-50"
                  >
                    <span className="block">Re-baseline</span>
                    <span className="block mt-0.5 text-[10px] text-slate-400">Replace the saved baseline with the current plan</span>
                  </button>
                  <div className="border-t border-slate-100" />
                  <button
                    onClick={() => {
                      onClearBaseline?.();
                      setShowBaselineMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-[11px] font-medium text-rose-600 active:bg-rose-50"
                  >
                    <span className="block">Delete baseline</span>
                    <span className="block mt-0.5 text-[10px] text-rose-300">Remove the saved baseline snapshot</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="px-3 pt-2.5 pb-1">
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full text-[12px] px-3 py-2 bg-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white transition-all"
        />
      </div>

      {/* Filter chips */}
      <div className="px-3 py-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-all flex-shrink-0 ${
              filter === f
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-500 border border-slate-200 active:bg-slate-50'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Task count */}
      <div className="px-4 py-1 text-[10px] text-slate-400 font-medium">
        {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        {filter !== 'All' && <span> · Filtered: {filter}</span>}
      </div>

      {/* Task cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {filteredTasks.map(t => (
          <TaskCard
            key={t.id}
            task={t}
            depth={t.indent || 0}
            onTap={onTaskTap}
          />
        ))}
        {filteredTasks.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400">
            <div className="text-2xl mb-2">📋</div>
            No tasks match this filter
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(MobilePlan);
