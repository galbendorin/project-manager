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
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState(55);

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

  // Panel resizing
  useEffect(() => {
    const resizer = resizerRef.current;
    if (!resizer) return;

    let startX, startPct;

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const containerWidth = resizer.parentElement.offsetWidth;
      const newPct = startPct + (dx / containerWidth) * 100;
      setLeftPaneWidthPct(Math.max(25, Math.min(75, newPct)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const onMouseDown = (e) => {
      e.preventDefault();
      startX = e.clientX;
      startPct = leftPaneWidthPct;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    resizer.addEventListener('mousedown', onMouseDown);
    return () => resizer.removeEventListener('mousedown', onMouseDown);
  }, [leftPaneWidthPct]);

  // Sync scroll between grid and chart
  useEffect(() => {
    let cleanup;
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

      {/* Always side-by-side — scrolls horizontally on narrow screens */}
      <div className="flex-grow min-h-0 flex flex-row overflow-x-auto overflow-y-hidden">
        <div
          className="flex-none bg-white flex flex-col overflow-hidden z-20 border-r border-slate-200"
          style={{ width: `${leftPaneWidthPct}%`, minWidth: '480px', height: '100%' }}
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

        <div
          ref={resizerRef}
          className="w-1 bg-slate-200 hover:bg-indigo-400 cursor-col-resize z-30 transition-colors flex-none"
        />

        <div
          className="flex flex-col overflow-hidden min-h-0 flex-grow"
          style={{ minWidth: '300px', height: '100%' }}
        >
          <GanttChart tasks={visibleTasks} viewMode={viewMode} baseline={baseline} />
        </div>
      </div>
    </div>
  );
};

export default ScheduleView;
