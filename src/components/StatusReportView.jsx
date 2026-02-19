import React, { useMemo } from 'react';
import { getFinishDate } from '../utils/helpers';

const RAG_OPTIONS = ['Green', 'Amber', 'Red'];
const RAG_STYLES = {
  Green: { bg: 'bg-emerald-500', ring: 'ring-emerald-200', label: 'text-emerald-700', labelBg: 'bg-emerald-50' },
  Amber: { bg: 'bg-amber-500', ring: 'ring-amber-200', label: 'text-amber-700', labelBg: 'bg-amber-50' },
  Red: { bg: 'bg-rose-500', ring: 'ring-rose-200', label: 'text-rose-700', labelBg: 'bg-rose-50' }
};

const StatusReportView = ({
  tasks,
  baseline,
  registers,
  statusReport,
  onUpdateStatusReport
}) => {
  // Calculate overall project completion
  const projectCompletion = useMemo(() => {
    if (!tasks || tasks.length === 0) return 0;
    const totalPct = tasks.reduce((sum, t) => sum + (t.pct || 0), 0);
    return Math.round(totalPct / tasks.length);
  }, [tasks]);

  // Task stats
  const taskStats = useMemo(() => {
    if (!tasks || tasks.length === 0) return { total: 0, completed: 0, inProgress: 0, notStarted: 0, milestones: 0 };
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.pct === 100).length,
      inProgress: tasks.filter(t => t.pct > 0 && t.pct < 100).length,
      notStarted: tasks.filter(t => t.pct === 0).length,
      milestones: tasks.filter(t => t.type === 'Milestone').length
    };
  }, [tasks]);

  // Milestone comparison (baseline vs actual)
  const milestoneComparison = useMemo(() => {
    const milestones = tasks.filter(t => t.type === 'Milestone');
    if (!milestones.length) return [];

    const baselineMap = baseline ? new Map(baseline.map(b => [b.id, b])) : new Map();

    return milestones.map(ms => {
      const bl = baselineMap.get(ms.id);
      const actualStart = ms.start;
      const actualFinish = getFinishDate(ms.start, ms.dur);
      const baselineStart = bl ? bl.start : '—';
      const baselineFinish = bl ? bl.finish || getFinishDate(bl.start, bl.dur) : '—';

      let varianceDays = null;
      if (bl) {
        const actualDate = new Date(actualStart);
        const baselineDate = new Date(bl.start);
        varianceDays = Math.round((actualDate - baselineDate) / 86400000);
      }

      return {
        id: ms.id,
        name: ms.name,
        baselineStart,
        baselineFinish,
        actualStart,
        actualFinish,
        varianceDays,
        pct: ms.pct
      };
    });
  }, [tasks, baseline]);

  // Top open risks from register
  const topRisks = useMemo(() => {
    if (!registers?.risks) return [];
    return registers.risks
      .filter(r => r.level && r.level.toString().toLowerCase() !== 'closed')
      .slice(0, 5);
  }, [registers]);

  // Top open issues from register
  const topIssues = useMemo(() => {
    if (!registers?.issues) return [];
    return registers.issues
      .filter(i => {
        const status = (i.status || '').toLowerCase();
        return status !== 'closed' && status !== 'completed';
      })
      .slice(0, 5);
  }, [registers]);

  const ragStyle = RAG_STYLES[statusReport.overallRag] || RAG_STYLES.Green;

  const handleFieldChange = (key, value) => {
    onUpdateStatusReport(key, value);
  };

  return (
    <div className="w-full h-full bg-slate-50 p-6 overflow-auto">
      <div className="max-w-[1200px] mx-auto space-y-5">

        {/* Header Row: RAG + Completion + Task Stats */}
        <div className="grid grid-cols-12 gap-4">
          {/* Overall RAG */}
          <div className="col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Overall Status</div>
            <div className={`w-20 h-20 rounded-full ${ragStyle.bg} ring-4 ${ragStyle.ring} flex items-center justify-center mb-3 shadow-lg`}>
              <span className="text-white font-black text-lg">{statusReport.overallRag}</span>
            </div>
            <div className="flex gap-1.5 mt-1">
              {RAG_OPTIONS.map(rag => (
                <button
                  key={rag}
                  onClick={() => handleFieldChange('overallRag', rag)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    statusReport.overallRag === rag
                      ? `${RAG_STYLES[rag].bg} border-slate-800 scale-110`
                      : `${RAG_STYLES[rag].bg} border-transparent opacity-40 hover:opacity-70`
                  }`}
                  title={rag}
                />
              ))}
            </div>
          </div>

          {/* Project Completion */}
          <div className="col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Project Completion</div>
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" stroke="#e2e8f0" strokeWidth="8" fill="none" />
                <circle
                  cx="50" cy="50" r="42"
                  stroke={projectCompletion === 100 ? '#10b981' : '#6366f1'}
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${projectCompletion * 2.64} ${264 - projectCompletion * 2.64}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-black text-slate-800">{projectCompletion}%</span>
              </div>
            </div>
          </div>

          {/* Task Stats */}
          <div className="col-span-6 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Task Summary</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-500">Total Tasks</span>
                <span className="text-lg font-black text-slate-800">{taskStats.total}</span>
              </div>
              <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
                <span className="text-[11px] text-emerald-600">Completed</span>
                <span className="text-lg font-black text-emerald-700">{taskStats.completed}</span>
              </div>
              <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                <span className="text-[11px] text-blue-600">In Progress</span>
                <span className="text-lg font-black text-blue-700">{taskStats.inProgress}</span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-500">Not Started</span>
                <span className="text-lg font-black text-slate-600">{taskStats.notStarted}</span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-grow h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{ width: `${taskStats.total ? (taskStats.completed / taskStats.total) * 100 : 0}%` }} />
                <div className="bg-blue-500 h-full" style={{ width: `${taskStats.total ? (taskStats.inProgress / taskStats.total) * 100 : 0}%` }} />
              </div>
              <span className="text-[10px] text-slate-400 flex-shrink-0">{taskStats.milestones} milestones</span>
            </div>
          </div>
        </div>

        {/* Narrative Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Overall Status Narrative</label>
            <textarea
              value={statusReport.overallNarrative}
              onChange={(e) => handleFieldChange('overallNarrative', e.target.value)}
              placeholder="Describe the current project status, key achievements, and concerns..."
              className="w-full h-28 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Additional Notes</label>
            <textarea
              value={statusReport.additionalNotes}
              onChange={(e) => handleFieldChange('additionalNotes', e.target.value)}
              placeholder="Any other notes, escalations, or decisions needed..."
              className="w-full h-28 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
        </div>

        {/* Deliverables Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Key Deliverables This Period</label>
            <textarea
              value={statusReport.deliverablesThisPeriod}
              onChange={(e) => handleFieldChange('deliverablesThisPeriod', e.target.value)}
              placeholder="What was delivered or achieved this reporting period..."
              className="w-full h-24 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Key Deliverables Next Period</label>
            <textarea
              value={statusReport.deliverablesNextPeriod}
              onChange={(e) => handleFieldChange('deliverablesNextPeriod', e.target.value)}
              placeholder="Planned deliverables and milestones for next period..."
              className="w-full h-24 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
        </div>

        {/* Risks & Issues from Registers */}
        <div className="grid grid-cols-2 gap-4">
          {/* Main Risks */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Risks</label>
              {topRisks.length > 0 && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {topRisks.length} open
                </span>
              )}
            </div>
            {topRisks.length > 0 ? (
              <div className="space-y-2 mb-3">
                {topRisks.map((risk, i) => (
                  <div key={risk._id || i} className="flex items-start gap-2 text-[11px] bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-amber-500 font-bold flex-shrink-0">R{risk.number}</span>
                    <span className="text-slate-600 flex-grow">{risk.riskdetails || risk.description || '—'}</span>
                    {risk.level && (
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        risk.level.toLowerCase() === 'high' ? 'bg-rose-100 text-rose-600' :
                        risk.level.toLowerCase() === 'medium' ? 'bg-amber-100 text-amber-600' :
                        'bg-emerald-100 text-emerald-600'
                      }`}>
                        {risk.level}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              value={statusReport.mainRisks}
              onChange={(e) => handleFieldChange('mainRisks', e.target.value)}
              placeholder="Additional risk commentary..."
              className="w-full h-16 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>

          {/* Main Issues */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Issues</label>
              {topIssues.length > 0 && (
                <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                  {topIssues.length} open
                </span>
              )}
            </div>
            {topIssues.length > 0 ? (
              <div className="space-y-2 mb-3">
                {topIssues.map((issue, i) => (
                  <div key={issue._id || i} className="flex items-start gap-2 text-[11px] bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-rose-500 font-bold flex-shrink-0">I{issue.number}</span>
                    <span className="text-slate-600 flex-grow">{issue.description || '—'}</span>
                    {issue.status && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">
                        {issue.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              value={statusReport.mainIssues}
              onChange={(e) => handleFieldChange('mainIssues', e.target.value)}
              placeholder="Additional issue commentary..."
              className="w-full h-16 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
        </div>

        {/* Milestone Comparison Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Milestone Comparison — Baseline vs Actual</label>
          
          {milestoneComparison.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                  <tr>
                    <th className="px-4 py-3 border-b">Milestone</th>
                    <th className="px-4 py-3 border-b text-center">Baseline Start</th>
                    <th className="px-4 py-3 border-b text-center">Baseline Finish</th>
                    <th className="px-4 py-3 border-b text-center">Actual Start</th>
                    <th className="px-4 py-3 border-b text-center">Actual Finish</th>
                    <th className="px-4 py-3 border-b text-center">Variance (Days)</th>
                    <th className="px-4 py-3 border-b text-center">Progress</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {milestoneComparison.map(ms => (
                    <tr key={ms.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700 text-[12px]">
                        <span className="text-amber-500 mr-1.5">◆</span>
                        {ms.name}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-400">{ms.baselineStart}</td>
                      <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-400">{ms.baselineFinish}</td>
                      <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-600">{ms.actualStart}</td>
                      <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-600">{ms.actualFinish}</td>
                      <td className="px-4 py-3 text-center">
                        {ms.varianceDays !== null ? (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                            ms.varianceDays === 0 ? 'text-emerald-600 bg-emerald-50' :
                            ms.varianceDays > 0 ? 'text-rose-600 bg-rose-50' :
                            'text-blue-600 bg-blue-50'
                          }`}>
                            {ms.varianceDays === 0 ? 'On Track' : ms.varianceDays > 0 ? `+${ms.varianceDays}d late` : `${ms.varianceDays}d early`}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">No baseline</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[11px] font-bold ${ms.pct === 100 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {ms.pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-300 text-sm">
              No milestones in schedule. Add milestone tasks to see the comparison table.
            </div>
          )}

          {!baseline && milestoneComparison.length > 0 && (
            <div className="mt-3 text-center text-[11px] text-amber-500 bg-amber-50 rounded-lg py-2">
              Set a baseline in the Schedule tab to enable variance tracking
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default StatusReportView;
