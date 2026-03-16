import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const baselineButtonRef = useRef(null);
  const baselineMenuRef = useRef(null);
  const [showBaselineMenu, setShowBaselineMenu] = useState(false);
  const [baselineMenuStyle, setBaselineMenuStyle] = useState({ top: 0, left: 0 });
  const { canBaseline, canExport, canImport, hasTabAccess } = usePlan();

  const updateBaselineMenuPosition = () => {
    if (typeof window === 'undefined' || !baselineButtonRef.current) return;

    const rect = baselineButtonRef.current.getBoundingClientRect();
    const menuWidth = 224;
    const menuHeight = baselineMenuRef.current?.offsetHeight || (hasBaseline ? 132 : 118);
    const gap = 8;

    const openAbove = rect.bottom + gap + menuHeight > window.innerHeight && rect.top - gap - menuHeight >= 8;
    const top = openAbove
      ? Math.max(8, rect.top - menuHeight - gap)
      : Math.max(8, Math.min(window.innerHeight - menuHeight - 8, rect.bottom + gap));
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));

    setBaselineMenuStyle({ top, left });
  };

  useEffect(() => {
    if (!showBaselineMenu) return undefined;

    const rafId = window.requestAnimationFrame(updateBaselineMenuPosition);

    const handlePointerDown = (event) => {
      const target = event.target;
      if (baselineButtonRef.current?.contains(target)) return;
      if (baselineMenuRef.current?.contains(target)) return;
      setShowBaselineMenu(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowBaselineMenu(false);
      }
    };

    window.addEventListener('resize', updateBaselineMenuPosition);
    window.addEventListener('scroll', updateBaselineMenuPosition, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateBaselineMenuPosition);
      window.removeEventListener('scroll', updateBaselineMenuPosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showBaselineMenu, hasBaseline]);

  const closeBaselineMenu = () => {
    setShowBaselineMenu(false);
  };

  const handleBaselineButtonClick = () => {
    if (!canBaseline) {
      if (onOpenPricing) onOpenPricing();
      return;
    }
    setShowBaselineMenu((prev) => !prev);
  };

  const handleSetBaseline = () => {
    onSetBaseline();
    closeBaselineMenu();
  };

  const handleRebaseline = () => {
    onSetBaseline();
    closeBaselineMenu();
  };

  const handleClearBaseline = () => {
    onClearBaseline();
    closeBaselineMenu();
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

  const baselineMenu = showBaselineMenu && canBaseline && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={baselineMenuRef}
          className="fixed z-[80] w-56 rounded-xl border border-slate-200 bg-white shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)]"
          style={{ top: `${baselineMenuStyle.top}px`, left: `${baselineMenuStyle.left}px` }}
        >
          <div className="border-b border-slate-100 px-3 py-2.5">
            <div className="text-[11px] font-semibold text-slate-800">Baseline</div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              {hasBaseline ? 'A baseline snapshot is saved for this project plan.' : 'No baseline snapshot has been saved yet.'}
            </div>
          </div>

          {!hasBaseline ? (
            <button
              onClick={handleSetBaseline}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-purple-50 hover:text-purple-700"
            >
              <span className="text-[13px]">📏</span>
              <span>Set baseline</span>
              <span className="ml-auto text-[10px] text-slate-400">Save snapshot</span>
            </button>
          ) : (
            <>
              <button
                onClick={handleRebaseline}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-purple-50 hover:text-purple-700"
              >
                <span className="text-[13px]">🔄</span>
                <span>Re-baseline</span>
                <span className="ml-auto text-[10px] text-slate-400">Update snapshot</span>
              </button>
              <div className="border-t border-slate-100" />
              <button
                onClick={handleClearBaseline}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
              >
                <span className="text-[13px]">🗑️</span>
                <span>Delete baseline</span>
                <span className="ml-auto text-[10px] text-rose-300">Remove</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
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
          className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-all ${
            isExternalView
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
          }`}
          title={isExternalView ? 'External view is on. Only public items are shown in registers.' : 'External view is off. All items are shown.'}
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

            <button
              ref={baselineButtonRef}
              onClick={handleBaselineButtonClick}
              className={`shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 border ${
                !canBaseline
                  ? 'text-slate-400 border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
                  : hasBaseline
                    ? 'text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100'
                    : 'text-slate-500 border-slate-200 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50'
              }`}
              title={!canBaseline ? 'Baseline — Pro feature' : 'Open baseline options'}
              aria-haspopup="menu"
              aria-expanded={showBaselineMenu}
            >
              {!canBaseline ? (
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : hasBaseline ? (
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              ) : (
                <span className="text-[13px] leading-none">📏</span>
              )}
              Baseline
              {canBaseline && <span className="text-[9px] ml-0.5">▾</span>}
            </button>

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
    {baselineMenu}
    </>
  );
};

export default Header;
