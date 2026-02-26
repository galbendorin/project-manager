import React from 'react';

const MobileHeader = ({ projectName, taskCount, saving, lastSaved, saveConflict, onNewTask, onBackToProjects }) => {
  return (
    <div className="flex-none bg-white border-b border-slate-100 px-4 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button onClick={onBackToProjects} className="flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-[10px]">PM</div>
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900 truncate">{projectName}</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              {taskCount} tasks
              <span className="text-slate-200">·</span>
              {saveConflict ? (
                <span className="text-rose-500 font-semibold">Conflict</span>
              ) : saving ? (
                <span className="text-amber-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Saving
                </span>
              ) : lastSaved ? (
                <span className="text-emerald-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Saved
                </span>
              ) : (
                <span className="text-slate-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> Ready
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onNewTask}
          className="flex-shrink-0 bg-indigo-600 active:bg-indigo-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-sm transition-colors"
        >
          + New
        </button>
      </div>
    </div>
  );
};

export default React.memo(MobileHeader);
