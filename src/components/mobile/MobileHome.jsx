import React, { useMemo } from 'react';

const ragStyle = (rag) => {
  if (rag === 'red') return { bg: 'bg-rose-50', dot: 'bg-rose-500', text: 'text-rose-700', border: 'border-rose-200' };
  if (rag === 'amber') return { bg: 'bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-200' };
  return { bg: 'bg-emerald-50', dot: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-200' };
};

const displayDate = (d) => {
  if (!d) return '–';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); }
  catch { return d; }
};

const MobileHome = ({ tasks, registers, statusReport, onUpdateTask }) => {
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.pct >= 100).length;
    const inProgress = tasks.filter(t => t.pct > 0 && t.pct < 100).length;
    const notStarted = total - completed - inProgress;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, notStarted, pct };
  }, [tasks]);

  const attentionItems = useMemo(() => {
    return tasks
      .filter(t => (t.rag === 'red' || t.rag === 'amber') && t.pct < 100)
      .sort((a, b) => {
        if (a.rag === 'red' && b.rag !== 'red') return -1;
        if (b.rag === 'red' && a.rag !== 'red') return 1;
        return (a.pct || 0) - (b.pct || 0);
      })
      .slice(0, 5);
  }, [tasks]);

  const milestones = useMemo(() => {
    return tasks
      .filter(t => t.type === 'Milestone' && t.pct < 100)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 5);
  }, [tasks]);

  const riskCount = useMemo(() => {
    const open = (registers.risks || []).filter(r => {
      const status = (r.status || r['Current Status'] || '').toLowerCase();
      return !status.includes('closed') && !status.includes('completed');
    }).length;
    return open;
  }, [registers]);

  return (
    <div className="p-3.5 space-y-3 pb-6">
      {/* Health Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { n: stats.total, l: 'Total', c: 'text-slate-800' },
          { n: stats.completed, l: 'Done', c: 'text-emerald-600' },
          { n: stats.inProgress, l: 'Active', c: 'text-blue-600' },
          { n: stats.notStarted, l: 'Pending', c: 'text-slate-400' },
        ].map(s => (
          <div key={s.l} className="bg-white rounded-xl p-2.5 text-center border border-slate-100 shadow-sm">
            <div className={`text-lg font-black ${s.c}`}>{s.n}</div>
            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Overall Progress */}
      <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-700">Overall Progress</span>
          <span className="text-base font-black text-indigo-600">{stats.pct}%</span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${stats.total ? (stats.completed / stats.total) * 100 : 0}%` }} />
          <div className="bg-blue-500 h-full transition-all" style={{ width: `${stats.total ? (stats.inProgress / stats.total) * 100 : 0}%` }} />
        </div>
        <div className="flex gap-4 mt-2 text-[9px] text-slate-400 font-medium">
          <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />Complete</span>
          <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1" />In Progress</span>
          {riskCount > 0 && <span className="text-rose-500 ml-auto font-semibold">{riskCount} open risks</span>}
        </div>
      </div>

      {/* Needs Attention */}
      {attentionItems.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Needs Attention
          </h3>
          {attentionItems.map((t, idx) => {
            const rc = ragStyle(t.rag);
            return (
              <div key={t.id} className={`${rc.bg} border ${rc.border} rounded-xl p-3 mb-2`}>
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full ${rc.dot} mt-1.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-800 truncate">{t.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Due {displayDate(t.finish)} · {t.owner || '–'}
                    </div>
                  </div>
                  <span className={`text-xs font-bold ${rc.text}`}>{t.pct || 0}%</span>
                </div>
                {/* Quick update buttons */}
                <div className="flex gap-2 mt-2 ml-4">
                  <button
                    onClick={() => {
                      const taskIdx = tasks.indexOf(t);
                      if (taskIdx >= 0) {
                        const newPct = Math.min((t.pct || 0) + 25, 100);
                        onUpdateTask(taskIdx, 'pct', newPct);
                      }
                    }}
                    className="text-[10px] font-bold text-indigo-600 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 active:bg-indigo-50 transition-colors"
                  >
                    +25%
                  </button>
                  <button
                    onClick={() => {
                      const taskIdx = tasks.indexOf(t);
                      if (taskIdx >= 0) onUpdateTask(taskIdx, 'pct', 100);
                    }}
                    className="text-[10px] font-bold text-emerald-600 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 active:bg-emerald-50 transition-colors"
                  >
                    Done ✓
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-sm">
          <h3 className="text-xs font-bold text-slate-700 mb-2">◆ Upcoming Milestones</h3>
          {milestones.map(m => (
            <div key={m.id} className="flex items-center gap-2 py-2 border-b border-slate-50 last:border-0">
              <span className="text-amber-500 text-[10px]">◆</span>
              <span className="text-xs text-slate-700 flex-1 font-medium truncate">{m.name}</span>
              <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">{displayDate(m.start)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Status Report summary */}
      {statusReport && statusReport.overallStatus && (
        <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-sm">
          <h3 className="text-xs font-bold text-slate-700 mb-2">📋 Status Summary</h3>
          <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">
            {statusReport.overallStatus}
          </p>
        </div>
      )}
    </div>
  );
};

export default React.memo(MobileHome);
