import React, { useState, useRef, useEffect } from 'react';

const Header = ({ 
  taskCount, 
  isExternalView, 
  onToggleExternalView, 
  onLoadTemplate,
  onResetDemoData,
  onShowDemoBenefits,
  onExport,
  onImport,
  onNewTask,
  onAddRegisterItem,
  addEntryLabel = 'Add Entry',
  onSetBaseline,
  onClearBaseline,
  hasBaseline,
  activeTab,
  isDemoProject = false,
  viewMode,
  onViewModeChange
}) => {
  const [showBaselineMenu, setShowBaselineMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const baselineRef = useRef(null);
  const moreRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (baselineRef.current && !baselineRef.current.contains(e.target)) setShowBaselineMenu(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    if (e.target.files?.[0]) {
      onImport(e.target.files[0]);
      e.target.value = '';
    }
  };

  // Shared button styles
  const btnSecondary = "text-[11px] font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg transition-all";
  const btnAccent = (color) => `text-[11px] font-medium text-${color}-600 border border-${color}-200 bg-${color}-50 hover:bg-${color}-100 px-2.5 py-1.5 rounded-lg transition-all`;

  return (
    <header className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Project info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[14px] font-bold text-slate-800 truncate">Project Management OS</h1>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              {taskCount} tasks
            </p>
          </div>
        </div>
      
        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* External View toggle */}
          <button
            onClick={onToggleExternalView}
            className={`${btnSecondary} hidden sm:flex items-center gap-1.5`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isExternalView ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            External
          </button>

          {/* Demo buttons — always visible when demo project */}
          {isDemoProject && (
            <>
              <button
                onClick={onShowDemoBenefits}
                className="text-[11px] font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-all hidden sm:block"
              >
                Free Benefits
              </button>
              <button
                onClick={onLoadTemplate}
                className="text-[11px] font-semibold text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-all hidden sm:block"
              >
                SD-WAN Demo
              </button>
              <button
                onClick={onResetDemoData}
                className="text-[11px] font-semibold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-all hidden md:block"
              >
                Reset Demo
              </button>
              <div className="h-5 w-px bg-slate-200 mx-0.5 hidden sm:block" />
            </>
          )}

          {activeTab === 'schedule' ? (
            <>
              {/* Import */}
              <button onClick={handleImportClick} className={`${btnSecondary} hidden md:flex items-center gap-1`}>
                ↑ Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Baseline */}
              <div className="relative hidden md:block" ref={baselineRef}>
                <button
                  onClick={handleSetBaseline}
                  className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 border ${
                    hasBaseline 
                      ? 'text-purple-600 border-purple-200 bg-purple-50 hover:bg-purple-100' 
                      : 'text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50'
                  }`}
                >
                  {hasBaseline && <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                  Baseline
                  {hasBaseline && <span className="text-[9px] ml-0.5">▾</span>}
                </button>

                {showBaselineMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50 w-48">
                    <button
                      onClick={handleRebaseline}
                      className="w-full text-left px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
                    >
                      🔄 Re-baseline
                      <span className="text-[10px] text-slate-400 ml-auto">Update snapshot</span>
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      onClick={handleClearBaseline}
                      className="w-full text-left px-3 py-2 text-[11px] font-medium text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2"
                    >
                      ✕ Clear baseline
                      <span className="text-[10px] text-rose-400 ml-auto">Remove ghost bars</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="h-5 w-px bg-slate-200 mx-0.5 hidden md:block" />

              {/* View mode */}
              <select
                value={viewMode}
                onChange={(e) => onViewModeChange(e.target.value)}
                className="text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-1.5 rounded-lg outline-none cursor-pointer hover:border-slate-300 hidden sm:block"
              >
                <option value="week">1 Week</option>
                <option value="2week">2 Weeks</option>
                <option value="month">Monthly</option>
              </select>

              {/* New Task - always visible */}
              <button
                onClick={onNewTask}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold py-1.5 px-3 rounded-lg transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-200/50"
              >
                <span className="text-[13px] leading-none">+</span>
                <span className="hidden sm:inline">New Task</span>
              </button>
            </>
          ) : (
            <button
              onClick={onAddRegisterItem}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold py-1.5 px-3 rounded-lg transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-200/50"
            >
              <span className="text-[13px] leading-none">+</span>
              <span className="hidden sm:inline">{addEntryLabel}</span>
            </button>
          )}

          {/* Export */}
          <button onClick={onExport} className={`${btnSecondary} hidden sm:block`}>
            Export
          </button>

          {/* More menu (overflow for mobile + demo actions) */}
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition-all"
              title="More actions"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </button>

            {showMoreMenu && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50 w-52">
                {/* Mobile-only items */}
                <button
                  onClick={() => { onToggleExternalView(); setShowMoreMenu(false); }}
                  className="w-full text-left px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors sm:hidden"
                >
                  {isExternalView ? '✓ ' : ''}External View
                </button>
                <button
                  onClick={() => { onExport(); setShowMoreMenu(false); }}
                  className="w-full text-left px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors sm:hidden"
                >
                  Export
                </button>

                {activeTab === 'schedule' && (
                  <>
                    <button
                      onClick={() => { handleImportClick(); setShowMoreMenu(false); }}
                      className="w-full text-left px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors md:hidden"
                    >
                      ↑ Import from Excel
                    </button>
                    <button
                      onClick={() => { handleSetBaseline(); setShowMoreMenu(false); }}
                      className="w-full text-left px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors md:hidden"
                    >
                      {hasBaseline ? '● ' : ''}Baseline
                    </button>
                  </>
                )}

                {/* Demo actions - mobile only (visible in header on desktop) */}
                {isDemoProject && (
                  <>
                    <div className="border-t border-slate-100 my-1 sm:hidden" />
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider sm:hidden">Demo</div>
                    <button
                      onClick={() => { onShowDemoBenefits(); setShowMoreMenu(false); }}
                      className="w-full text-left px-3 py-2 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 transition-colors sm:hidden"
                    >
                      Free Benefits
                    </button>
                    <button
                      onClick={() => { onLoadTemplate(); setShowMoreMenu(false); }}
                      className="w-full text-left px-3 py-2 text-[11px] font-medium text-emerald-600 hover:bg-emerald-50 transition-colors sm:hidden"
                    >
                      Load SD-WAN Demo
                    </button>
                    <button
                      onClick={() => { onResetDemoData(); setShowMoreMenu(false); }}
                      className="w-full text-left px-3 py-2 text-[11px] font-medium text-rose-600 hover:bg-rose-50 transition-colors md:hidden"
                    >
                      Reset Demo Data
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
