import React, { useState, useMemo, useCallback } from 'react';
import TaskCard from './TaskCard';
import { buildVisibleTasks } from '../../utils/helpers';

const FILTERS = ['All', 'Active', 'Overdue', 'Milestones', 'Red/Amber'];

const MobilePlan = ({ tasks, onTaskTap }) => {
  const [filter, setFilter] = useState('All');
  const [collapsedIndices, setCollapsedIndices] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCollapse = useCallback((index) => {
    setCollapsedIndices(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }, []);

  const visibleTasks = useMemo(() => buildVisibleTasks(tasks, collapsedIndices), [tasks, collapsedIndices]);

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
