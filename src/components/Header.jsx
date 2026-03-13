import React, { useRef } from 'react';
import { ICONS } from '../utils/constants';
import { PlanBadge } from './UpgradeBanner';
import { usePlan } from '../contexts/PlanContext';

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
  onViewModeChange,
  onOpenPricing,
  onOpenBilling
}) => {
  const fileInputRef = useRef(null);
  const { canBaseline, canExport, canImport, hasTabAccess } = usePlan();

  const handleSetBaseline = () => {
    if (!canBaseline) {
      if (onOpenPricing) onOpenPricing();
      return;
    }
    onSetBaseline();
  };

  const handleRebaseline = () => {
    onSetBaseline();
  };

  const handleClearBaseline = () => {
    onClearBaseline();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      e.target.value = '';
    }
  };

  // Don't show Add Entry for blurred/locked tabs
  const canAddEntry = hasTabAccess(activeTab);

  return (
    <header className="flex-none bg-white border-b border-slate-200 px-2.5 sm:px-4 py-2 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-2 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
          P
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-slate-800 leading-tight truncate">
              Project Management OS
            </h1>
            <PlanBadge />
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            {taskCount} tasks
          </p>
        </div>
      </div>
      
      <div className="w-full lg:w-auto overflow-x-auto no-scrollbar pb-1 -mb-1">
        <div className="flex items-center gap-1.5 min-w-max lg:min-w-0 lg:flex-wrap lg:justify-end">
        <button
          onClick={onToggleExternalView}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-500 text-[11px] font-medium transition-all hover:bg-slate-50 hover:border-slate-300"
        >
          <div className={`w-1.5 h-1.5 rounded-full ${isExternalView ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          External View
        </button>

        {activeTab === 'schedule' ? (
          <div className="flex items-center gap-1.5 min-w-max lg:min-w-0 lg:flex-wrap">
            {isDemoProject && (
              <>
                <button
                  onClick={onShowDemoBenefits}
                  title="Show client-facing benefits of the platform"
                  className="shrink-0 text-[11px] font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-md transition-all"
                >
                  Free Benefits
                </button>

                <button
                  onClick={onLoadTemplate}
                  title="Load network transformation demo plan with all sample tab data"
                  className="shrink-0 text-[11px] font-medium text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-md transition-all"
                >
                  Demo Project
                </button>

                <button
                  onClick={onResetDemoData}
                  title="Reset demo content in this project"
                  className="shrink-0 text-[11px] font-medium text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-md transition-all"
                >
                  Reset Demo
                </button>
              </>
            )}

            {/* Import button */}
            {canImport && (
              <>
                <button
                  onClick={handleImportClick}
                  className="shrink-0 text-[11px] font-medium text-slate-500 border border-slate-200 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1"
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
              </>
            )}

            {!canBaseline ? (
              <button
                onClick={handleSetBaseline}
                className="shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 border text-slate-400 border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
                title="Baseline — Pro feature"
              >
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Baseline
              </button>
            ) : hasBaseline ? (
              <>
                <button
                  onClick={handleRebaseline}
                  className="shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 border text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100"
                  title="Update the saved baseline snapshot"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Re-baseline
                </button>
                <button
                  onClick={handleClearBaseline}
                  className="shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all border text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100"
                  title="Delete the saved baseline snapshot"
                >
                  Delete Baseline
                </button>
              </>
            ) : (
              <button
                onClick={handleSetBaseline}
                className="shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 border text-slate-500 border-slate-200 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50"
                title="Set baseline snapshot"
              >
                Set Baseline
              </button>
            )}

            <div className="hidden sm:block h-5 w-px bg-slate-200 mx-0.5" />
            <select
              value={viewMode}
              onChange={(e) => onViewModeChange(e.target.value)}
              className="shrink-0 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-1.5 rounded-md outline-none cursor-pointer hover:border-slate-300"
            >
              <option value="week">1 Week</option>
              <option value="2week">2 Weeks</option>
              <option value="month">Monthly</option>
            </select>
            <button
              onClick={onNewTask}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium py-1.5 px-3 rounded-md transition-all flex items-center gap-1.5"
            >
              <span className="text-[13px] leading-none">+</span>
              New Task
            </button>
          </div>
        ) : canAddEntry && addEntryLabel ? (
          <button
            onClick={onAddRegisterItem}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium py-1.5 px-3 rounded-md transition-all flex items-center gap-1.5"
          >
            <span className="text-[13px] leading-none">+</span>
            {addEntryLabel}
          </button>
        ) : null}

        {canExport && (
          <button
            onClick={onExport}
            className="shrink-0 text-[11px] font-medium text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2.5 py-1.5 rounded-md transition-all"
          >
            Export
          </button>
        )}

        {/* Billing / Upgrade button */}
        {onOpenBilling && (
          <button
            onClick={onOpenBilling}
            className="shrink-0 text-[11px] font-medium text-slate-500 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-2.5 py-1.5 rounded-md transition-all"
            title="Billing & plan"
          >
            Billing
          </button>
        )}
        </div>
      </div>
    </header>
  );
};

export default Header;
