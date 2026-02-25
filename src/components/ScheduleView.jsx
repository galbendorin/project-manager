import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ScheduleGrid from './ScheduleGrid';
import GanttChart from './GanttChart';
import { buildVisibleTasks } from '../utils/helpers';

const ScheduleView = ({ 
  tasks,
  viewMode,
  baseline,
  onUpdateTask,
  onDeleteTask,
  onModifyHierarchy,
  onToggleTrack,
  onInsertTask,
  onReorderTask,
  onSendToTracker,
  onSendToActionLog,
  onRemoveFromActionLog,
  onRemoveFromTracker,
  isInTracker
}) => {
  const resizerRef = useRef(null);
  const scrollSourceRef = useRef(null);
  const [layoutMode, setLayoutMode] = useState(() => {
    if (typeof window === 'undefined') return 'desktop';
    if (window.innerWidth < 768) return 'mobile';
    if (window.innerWidth < 1200) return 'tablet';
    return 'desktop';
  });
  const [showGanttMobile, setShowGanttMobile] = useState(false);
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState(55);

  const isCompactLayout = layoutMode !== 'desktop';
  const isMobile = layoutMode === 'mobile';

  // Collapsed state lives here so both grid + Gantt stay in sync
  const [collapsedIndices, setCollapsedIndices] = useState(new Set());

  const toggleCollapse = useCallback((index) => {
    setCollapsedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Visible tasks with parent summaries baked in
  const visibleTasks = useMemo(
    () => buildVisibleTasks(tasks, collapsedIndices),
    [tasks, collapsedIndices]
  );

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < 768) setLayoutMode('mobile');
      else if (w < 1200) setLayoutMode('tablet');
      else setLayoutMode('desktop');
    };
    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Panel resizing
  useEffect(() => {
    const resizer = resizerRef.current;
    if (!resizer) return;
    let isResizing = false;

    const handleMouseDown = () => {
      if (isCompactLayout) return;
      isResizing = true;
      document.body.style.cursor = 'col-resize';
    };
    const handleMouseMove = (e) => {
      if (!isResizing || isCompactLayout) return;
      const newWidthPct = (e.clientX / window.innerWidth) * 100;
      if (newWidthPct > 25 && newWidthPct < 85) setLeftPaneWidthPct(newWidthPct);
    };
    const handleMouseUp = () => {
      isResizing = false;
      document.body.style.cursor = 'default';
    };

    resizer.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      resizer.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isCompactLayout]);

  // Synchronized vertical scrolling
  useEffect(() => {
    let cleanup = null;
    const timer = setTimeout(() => {
      const gridScroll = document.getElementById('grid-scroll');
      const chartScroll = document.getElementById('chart-scroll');
      if (!gridScroll || !chartScroll) return;

      const syncScroll = (source, target) => () => {
        if (scrollSourceRef.current && scrollSourceRef.current !== source) return;
        scrollSourceRef.current = source;
        target.scrollTop = source.scrollTop;
        requestAnimationFrame(() => { scrollSourceRef.current = null; });
      };

      const handleGridScroll = syncScroll(gridScroll, chartScroll);
      const handleChartScroll = syncScroll(chartScroll, gridScroll);

      gridScroll.addEventListener('scroll', handleGridScroll, { passive: true });
      chartScroll.addEventListener('scroll', handleChartScroll, { passive: true });

      cleanup = () => {
        gridScroll.removeEventListener('scroll', handleGridScroll);
        chartScroll.removeEventListener('scroll', handleChartScroll);
      };
    }, 150);
    return () => {
      clearTimeout(timer);
      if (cleanup) cleanup();
    };
  }, [visibleTasks]);

  const leftPaneStyle = useMemo(() => {
    if (isMobile) {
      return { width: '100%', minWidth: '0', height: showGanttMobile ? '50%' : '100%' };
    }
    if (isCompactLayout) {
      return { width: '100%', minWidth: '0', height: '52%' };
    }
    return { width: `${leftPaneWidthPct}%`, minWidth: '460px', height: '100%' };
  }, [isMobile, isCompactLayout, leftPaneWidthPct, showGanttMobile]);

  const rightPaneStyle = useMemo(() => {
    if (isMobile) {
      return { height: '50%' };
    }
    if (isCompactLayout) {
      return { height: '48%' };
    }
    return { height: '100%' };
  }, [isMobile, isCompactLayout]);

  const [showLegend, setShowLegend] = useState(false);

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden">
      {showLegend && (
        <div className="flex-none px-2 py-1 bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-700">Legend</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-200 border border-red-300" /> Red</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-200 border border-amber-300" /> Amber</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-700 border border-amber-800" /> Brown</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-200 border border-emerald-300" /> Complete</span>
          <span className="inline-flex items-center gap-1"><span className="px-1 rounded border border-indigo-300 text-indigo-700 bg-indigo-50 text-[9px] font-semibold">MT+</span> Master Tracker</span>
          <span className="inline-flex items-center gap-1"><span className="px-1 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 text-[9px] font-semibold">AL+</span> Action Log</span>
          <button onClick={() => setShowLegend(false)} className="ml-auto text-slate-400 hover:text-slate-600 text-[10px]">✕</button>
        </div>
      )}
      {!showLegend && (
        <div className="flex-none px-2 py-0.5 bg-slate-50 border-b border-slate-200 flex justify-end">
          <button onClick={() => setShowLegend(true)} className="text-[10px] text-slate-400 hover:text-indigo-600 transition-colors">
            Show legend
          </button>
        </div>
      )}

      <div className={`flex-grow min-h-0 flex overflow-hidden ${isCompactLayout ? 'flex-col' : 'flex-row'}`}>
        <div
          className={`flex-none bg-white flex flex-col overflow-hidden z-20 ${
            isCompactLayout ? 'border-b border-slate-200' : 'border-r border-slate-200'
          }`}
          style={leftPaneStyle}
        >
          <ScheduleGrid
            allTasks={tasks}
            visibleTasks={visibleTasks}
            collapsedIndices={collapsedIndices}
            onToggleCollapse={toggleCollapse}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
            onModifyHierarchy={onModifyHierarchy}
            onToggleTrack={onToggleTrack}
            onInsertTask={onInsertTask}
            onReorderTask={onReorderTask}
            onSendToTracker={onSendToTracker}
            onSendToActionLog={onSendToActionLog}
            onRemoveFromActionLog={onRemoveFromActionLog}
            onRemoveFromTracker={onRemoveFromTracker}
            isInTracker={isInTracker}
          />
        </div>

        {/* Mobile: toggle button to show/hide Gantt */}
        {isMobile && (
          <button
            onClick={() => setShowGanttMobile(!showGanttMobile)}
            className="flex-none flex items-center justify-center gap-1.5 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="4" /><rect x="14" y="3" width="7" height="4" />
              <rect x="3" y="10" width="11" height="4" /><rect x="3" y="17" width="5" height="4" />
            </svg>
            {showGanttMobile ? 'Hide Gantt Chart' : 'Show Gantt Chart'}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className={`transition-transform ${showGanttMobile ? 'rotate-180' : ''}`}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        )}

        {!isCompactLayout && (
          <div
            ref={resizerRef}
            className="w-1 bg-slate-200 hover:bg-indigo-400 cursor-col-resize z-30 transition-colors flex-none"
          />
        )}

        {/* Gantt: hidden on mobile unless toggled */}
        {(!isMobile || showGanttMobile) && (
          <div
            className={`flex flex-col overflow-hidden min-h-0 ${isCompactLayout ? 'flex-none' : 'flex-grow min-w-0'}`}
            style={rightPaneStyle}
          >
            <GanttChart tasks={visibleTasks} viewMode={viewMode} baseline={baseline} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleView;
