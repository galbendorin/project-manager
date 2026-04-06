import React from 'react';

const RAG_OPTIONS = ['Green', 'Amber', 'Red'];

const StatusReportSummaryCards = ({
  isMobile,
  onChangeOverallRag,
  projectCompletion,
  ragStyle,
  ragStyles,
  statusReport,
  taskStats,
}) => {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-12 md:gap-4">
      <div className="col-span-1 md:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 flex flex-col items-center justify-center">
        <div className={`mb-3 text-center font-bold text-slate-400 ${isMobile ? 'text-[11px] tracking-[0.14em]' : 'text-[10px] uppercase tracking-widest'}`}>
          Overall Status
        </div>
        <div className={`${isMobile ? 'h-24 w-24' : 'w-20 h-20'} rounded-full ${ragStyle.bg} ring-4 ${ragStyle.ring} flex items-center justify-center mb-3 shadow-lg`}>
          <span className={`text-white font-black ${isMobile ? 'text-xl' : 'text-lg'}`}>{statusReport.overallRag}</span>
        </div>
        <div className="mt-1 flex gap-1.5">
          {RAG_OPTIONS.map(rag => (
            <button
              key={rag}
              onClick={() => onChangeOverallRag(rag)}
              className={`w-7 h-7 rounded-full border-2 transition-all ${
                statusReport.overallRag === rag
                  ? `${ragStyles[rag].bg} border-slate-800 scale-110`
                  : `${ragStyles[rag].bg} border-transparent opacity-40 hover:opacity-70`
              }`}
              title={rag}
            />
          ))}
        </div>
      </div>

      <div className="col-span-1 md:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 flex flex-col items-center justify-center">
        <div className={`mb-3 text-center font-bold text-slate-400 ${isMobile ? 'text-[11px] tracking-[0.14em]' : 'text-[10px] uppercase tracking-widest'}`}>
          Project Completion
        </div>
        <div className={`relative ${isMobile ? 'h-24 w-24' : 'w-24 h-24'}`}>
          <svg className={`${isMobile ? 'h-24 w-24' : 'w-24 h-24'} transform -rotate-90`} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" stroke="#e2e8f0" strokeWidth="8" fill="none" />
            <circle
              cx="50"
              cy="50"
              r="42"
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

      <div className="col-span-2 md:col-span-6 bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
        <div className={`mb-3 font-bold text-slate-400 ${isMobile ? 'text-[11px] tracking-[0.14em]' : 'text-[10px] uppercase tracking-widest'}`}>
          Task Summary
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
            <span className={`${isMobile ? 'text-[12px]' : 'text-[11px]'} text-slate-500`}>Total Tasks</span>
            <span className="text-lg font-black text-slate-800">{taskStats.total}</span>
          </div>
          <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
            <span className={`${isMobile ? 'text-[12px]' : 'text-[11px]'} text-emerald-600`}>Completed</span>
            <span className="text-lg font-black text-emerald-700">{taskStats.completed}</span>
          </div>
          <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
            <span className={`${isMobile ? 'text-[12px]' : 'text-[11px]'} text-blue-600`}>In Progress</span>
            <span className="text-lg font-black text-blue-700">{taskStats.inProgress}</span>
          </div>
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
            <span className={`${isMobile ? 'text-[12px]' : 'text-[11px]'} text-slate-500`}>Not Started</span>
            <span className="text-lg font-black text-slate-600">{taskStats.notStarted}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-grow h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${taskStats.total ? (taskStats.completed / taskStats.total) * 100 : 0}%` }} />
            <div className="bg-blue-500 h-full" style={{ width: `${taskStats.total ? (taskStats.inProgress / taskStats.total) * 100 : 0}%` }} />
          </div>
          <span className="text-[10px] text-slate-400 flex-shrink-0">{taskStats.milestones} milestones</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(StatusReportSummaryCards);
