import React, { useState, useRef, useEffect } from 'react';
import { ICONS } from '../utils/constants';

const Header = ({ 
  taskCount, 
  isExternalView, 
  onToggleExternalView, 
  onLoadTemplate,
  onExport,
  onImport,
  onNewTask,
  onAddRegisterItem,
  onSetBaseline,
  onClearBaseline,
  hasBaseline,
  activeTab,
  viewMode,
  onViewModeChange
}) => {
  const [showBaselineMenu, setShowBaselineMenu] = useState(false);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowBaselineMenu(false);
      }
    };
    if (showBaselineMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBaselineMenu]);

  const handleSetBaseline = () => {
    if (hasBaseline) {
      setShowBaselineMenu(!showBaselineMenu);
    } else {
      onSetBaseline();
    }
  };

  const handleRebaseline = () => {
    onSetBaseline();
    setShowBaselineMenu(false);
  };

  const handleClearBaseline = () => {
    onClearBaseline();
    setShowBaselineMenu(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      // Reset input so same file can be re-imported
      e.target.value = '';
    }
  };

  return (
    <header className="flex-none bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-2 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
          P
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-slate-800 leading-tight truncate">
            Project Management OS
          </h1>
          <p className="text-[10px] text-slate-400 font-medium">
            {taskCount} tasks
          </p>
        </div>
      </div>
      
      <div className="w-full lg:w-auto flex flex-wrap items-center gap-1.5 lg:justify-end">
        <button
          onClick={onToggleExternalView}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-500 text-[11px] font-medium transition-all hover:bg-slate-50 hover:border-slate-300"
        >
          <div className={`w-1.5 h-1.5 rounded-full ${isExternalView ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          External View
        </button>

        {activeTab === 'schedule' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={onLoadTemplate}
              title="Load SD-WAN + 10 Ethernet circuits demo plan"
              className="text-[11px] font-medium text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2.5 py-1.5 rounded-md transition-all"
            >
              SD-WAN Demo
            </button>

            {/* Import button */}
            <button
              onClick={handleImportClick}
              className="text-[11px] font-medium text-slate-500 border border-slate-200 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1"
              title="Import from Excel (.xlsx)"
            >
              ↑ Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Baseline button with dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={handleSetBaseline}
                className={`text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 border ${
                  hasBaseline 
                    ? 'text-purple-600 border-purple-200 bg-purple-50 hover:bg-purple-100' 
                    : 'text-slate-500 border-slate-200 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50'
                }`}
                title={hasBaseline ? 'Baseline is set — click for options' : 'Set baseline snapshot'}
              >
                {hasBaseline && (
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                )}
                Baseline
                {hasBaseline && (
                  <span className="text-[9px] ml-0.5">▾</span>
                )}
              </button>

              {showBaselineMenu && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 w-48">
                  <button
                    onClick={handleRebaseline}
                    className="w-full text-left px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <span className="text-[13px]">🔄</span>
                    Re-baseline
                    <span className="text-[10px] text-slate-400 ml-auto">Update snapshot</span>
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    onClick={handleClearBaseline}
                    className="w-full text-left px-3 py-2 text-[11px] font-medium text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2"
                  >
                    <span className="text-[13px]">✕</span>
                    Clear baseline
                    <span className="text-[10px] text-rose-400 ml-auto">Remove ghost bars</span>
                  </button>
                </div>
              )}
            </div>

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
