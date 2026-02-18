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
    <header className="flex-none bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center z-30 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-100">
          P
        </div>
        <div>
          <h1 className="text-sm font-black text-slate-900 leading-tight tracking-tight">
            Project Management OS
          </h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            <span className="text-indigo-600">{taskCount}</span> Tasks Active
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleExternalView}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-500 text-[10px] font-bold uppercase transition-all hover:bg-slate-50"
        >
          <div className={`w-2 h-2 rounded-full transition-colors ${isExternalView ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          External View
        </button>

        {activeTab === 'schedule' ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onLoadTemplate}
              className="text-[10px] font-bold uppercase text-slate-500 bg-white border border-slate-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition-all"
            >
              Template
            </button>
            <button
              onClick={onSetBaseline}
              className="text-[10px] font-bold uppercase text-slate-500 bg-white border border-slate-200 hover:border-purple-300 hover:text-purple-600 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
              title="Snapshot current dates as baseline"
            >
              Baseline
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <select
              value={viewMode}
              onChange={(e) => onViewModeChange(e.target.value)}
              className="text-[10px] font-bold uppercase text-slate-600 bg-white border border-slate-200 px-2 py-1.5 rounded-lg outline-none cursor-pointer"
            >
              <option value="week">Weekly View</option>
              <option value="2week">Bi-Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <button
              onClick={onNewTask}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1.5 px-5 rounded-lg shadow-lg transition-all flex items-center gap-2"
            >
              <div dangerouslySetInnerHTML={{ __html: ICONS.plus }} />
              New Task
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={onAddRegisterItem}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-1.5 px-5 rounded-lg shadow-lg transition-all flex items-center gap-2"
            >
              <div dangerouslySetInnerHTML={{ __html: ICONS.plus }} />
              Add Entry
            </button>
          </div>
        )}

        <button
          onClick={onExport}
          className="bg-slate-800 hover:bg-black text-white text-[10px] font-bold py-1.5 px-4 rounded-lg transition-all shadow-md"
        >
          Export
        </button>
      </div>
    </header>
  );
};

export default Header;
