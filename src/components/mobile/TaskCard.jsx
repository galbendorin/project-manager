import React from 'react';

const ragStyle = (rag) => {
  if (rag === 'red') return { bg: 'bg-rose-50', dot: 'bg-rose-500', border: 'border-rose-200' };
  if (rag === 'amber') return { bg: 'bg-amber-50', dot: 'bg-amber-500', border: 'border-amber-200' };
  if (rag === 'green') return { bg: 'bg-emerald-50', dot: 'bg-emerald-500', border: 'border-emerald-200' };
  return { bg: 'bg-white', dot: 'bg-slate-300', border: 'border-slate-200' };
};

const displayDate = (d) => {
  if (!d) return '–';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch { return d; }
};

const TaskCard = ({ task, depth = 0, onTap }) => {
  const rc = ragStyle(task.rag || '');
  const isMS = task.type === 'Milestone';
  const isGroup = task.type === 'Group';

  return (
    <div
      onClick={() => onTap(task)}
      className={`mb-1.5 rounded-xl border ${rc.border} ${rc.bg} p-3 active:scale-[0.98] transition-transform cursor-pointer shadow-sm`}
      style={{ marginLeft: `${depth * 16}px` }}
    >
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-mono text-slate-400 mt-0.5 w-5 text-right flex-shrink-0">{task.id}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isMS && <span className="text-amber-500 text-[10px]">◆</span>}
            {isGroup && <span className="text-indigo-400 text-[10px]">▾</span>}
            <span className={`text-[13px] font-semibold text-slate-800 truncate ${task.pct >= 100 ? 'line-through text-slate-400' : ''}`}>
              {task.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
              isGroup ? 'bg-indigo-100 text-indigo-600' :
              isMS ? 'bg-violet-100 text-violet-600' :
              'bg-slate-200/60 text-slate-500'
            }`}>{task.type?.toUpperCase() || 'TASK'}</span>
            <span className="text-[10px] text-slate-400">{task.dur ?? 0}d</span>
            <span className="text-[10px] text-slate-400">·</span>
            <span className="text-[10px] text-slate-500">{displayDate(task.start)} → {displayDate(task.finish)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-black/5">
        <div className="flex-1 h-1.5 bg-black/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${task.pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${Math.min(task.pct || 0, 100)}%` }}
          />
        </div>
        <span className={`text-[10px] font-bold w-7 text-right ${task.pct >= 100 ? 'text-emerald-600' : 'text-slate-600'}`}>
          {task.pct || 0}%
        </span>
        <span className="text-[10px] font-medium text-slate-500 bg-white/50 px-1.5 py-0.5 rounded">{task.owner || '–'}</span>
        <div className={`w-2 h-2 rounded-full ${rc.dot}`} />
      </div>
    </div>
  );
};

export default React.memo(TaskCard);
