import React, { useMemo, useState, useCallback } from 'react';
import {
  collectDerivedTodos,
  bucketByDeadline,
  TODO_BUCKETS
} from '../../utils/helpers';

const bucketColors = {
  overdue: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  today: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  thisWeek: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  later: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400' },
  done: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  noDue: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-500', dot: 'bg-slate-300' },
};

const displayDate = (d) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); }
  catch { return d; }
};

const MobileTodo = ({ todos, projectData, registers, tracker, currentProject, currentUserId, onUpdateTodo, onDeleteTodo }) => {
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState('all'); // all, manual, derived

  // Merge manual + derived
  const allItems = useMemo(() => {
    const derived = collectDerivedTodos(projectData, registers, tracker);
    return [...(todos || []), ...derived];
  }, [todos, projectData, registers, tracker]);

  const filtered = useMemo(() => {
    let items = allItems;
    if (filter === 'manual') items = items.filter(i => !i.isDerived);
    if (filter === 'derived') items = items.filter(i => i.isDerived);
    return items;
  }, [allItems, filter]);

  const buckets = useMemo(() => bucketByDeadline(filtered), [filtered]);

  const handleToggle = useCallback((item) => {
    if (item.isDerived) return; // Can't toggle derived
    const newStatus = item.status === 'Done' ? 'Open' : 'Done';
    onUpdateTodo(item._id || item.id, 'status', newStatus);
  }, [onUpdateTodo]);

  const visibleBuckets = TODO_BUCKETS.filter(b => {
    if (b.key === 'done' && !showDone) return false;
    return (buckets[b.key] || []).length > 0;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="px-3 py-2.5 flex items-center gap-2 bg-white border-b border-slate-100">
        {['all', 'manual', 'derived'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full capitalize transition-all ${
              filter === f ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'
            }`}>
            {f === 'all' ? 'All' : f === 'manual' ? 'My Items' : 'Auto'}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setShowDone(!showDone)}
          className={`text-[10px] font-bold px-2.5 py-1.5 rounded-full transition-all ${showDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
          {showDone ? 'Hide Done' : 'Show Done'}
        </button>
      </div>

      {/* Buckets */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {visibleBuckets.map(b => {
          const items = buckets[b.key] || [];
          const colors = bucketColors[b.key] || bucketColors.later;

          return (
            <div key={b.key}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <h3 className={`text-xs font-bold ${colors.text}`}>{b.label}</h3>
                <span className="text-[10px] text-slate-400">({items.length})</span>
              </div>
              {items.map((item, idx) => (
                <div key={item._id || item.id || idx}
                  className={`${colors.bg} border ${colors.border} rounded-xl p-3 mb-1.5`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={item.isDerived}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                        item.status === 'Done'
                          ? 'bg-emerald-500 border-emerald-500'
                          : item.isDerived
                          ? 'border-slate-300 bg-slate-50'
                          : 'border-slate-300 active:border-indigo-400'
                      }`}
                    >
                      {item.status === 'Done' && <span className="text-white text-[9px]">✓</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-semibold ${item.status === 'Done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {item.title || item.description || 'Untitled'}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {item.isDerived && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">{item.source}</span>
                        )}
                        {item.owner && (
                          <span className="text-[10px] text-slate-500">{item.owner}</span>
                        )}
                        {item.dueDate && (
                          <span className="text-[10px] text-slate-400">{displayDate(item.dueDate)}</span>
                        )}
                      </div>
                    </div>
                    {/* Delete for manual only */}
                    {!item.isDerived && (
                      <button
                        onClick={() => { if (window.confirm('Delete this item?')) onDeleteTodo(item._id || item.id); }}
                        className="text-slate-300 active:text-rose-400 text-xs flex-shrink-0 p-1"
                      >✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {visibleBuckets.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400">
            <div className="text-2xl mb-2">✅</div>
            All caught up!
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(MobileTodo);
