import React from 'react';
import { ICONS } from '../utils/constants';

const Header = ({ 
  taskCount, 
  isExternalView, 
  onToggleExternalView, 
  onLoadTemplate,
  onExport,
  onNewTask,
  onAddRegisterItem,
  onSetBaseline,
  activeTab,
  viewMode,
  onViewModeChange
}) => {
  return (
    <header className="flex-none bg-white border-b border-slate-200 px-4 py-2 flex justify-between items-center z-30">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
          P
        </div>
        <div>
          <h1 className="text-sm font-semibold text-slate-800 leading-tight">
            Project Management OS
          </h1>
          <p className="text-[10px] text-slate-400 font-medium">
            {taskCount} tasks
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleExternalView}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-500 text-[11px] font-medium transition-all hover:bg-slate-50 hover:border-slate-300"
        >
          <div className={`w-1.5 h-1.5 rounded-full ${isExternalView ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          External View
        </button>

        {activeTab === 'schedule' ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onLoadTemplate}
              className="text-[11px] font-medium text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2.5 py-1.5 rounded-md transition-all"
            >
              Template
            </button>
            <button
              onClick={onSetBaseline}
              className="text-[11px] font-medium text-slate-500 border border-slate-200 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 px-2.5 py-1.5 rounded-md transition-all"
              title="Snapshot current dates as baseline"
            >
              Baseline
            </button>
            <div className="h-5 w-px bg-slate-200 mx-0.5" />
            <select
              value={viewMode}
              onChange={(e) => onViewModeChange(e.target.value)}
              className="text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-1.5 rounded-md outline-none cursor-pointer hover:border-slate-300"
            >
              <option value="week">1 Week</option>
              <option value="2week">2 Weeks</option>
              <option value="month">Monthly</option>
            </select>
            <button
              onClick={onNewTask}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium py-1.5 px-3 rounded-md transition-all flex items-center gap-1.5"
            >
              <span className="text-[13px] leading-none">+</span>
              New Task
            </button>
          </div>
        ) : (
          <button
            onClick={onAddRegisterItem}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium py-1.5 px-3 rounded-md transition-all flex items-center gap-1.5"
          >
            <span className="text-[13px] leading-none">+</span>
            Add Entry
          </button>
        )}

        <button
          onClick={onExport}
          className="text-[11px] font-medium text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2.5 py-1.5 rounded-md transition-all"
        >
          Export
        </button>
      </div>
    </header>
  );
};

export default Header;
