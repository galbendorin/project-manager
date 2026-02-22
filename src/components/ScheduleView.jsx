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
  const [isCompactLayout, setIsCompactLayout] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 1200 : false
  ));
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

  useEffect(() => {
    const handleResize = () => {
      setIsCompactLayout(window.innerWidth < 1200);
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
    if (isCompactLayout) {
      return { width: '100%', minWidth: '0', height: '52%' };
    }
    return { width: `${leftPaneWidthPct}%`, minWidth: '460px', height: '100%' };
  }, [isCompactLayout, leftPaneWidthPct]);

  const rightPaneStyle = useMemo(() => {
    if (isCompactLayout) {
      return { height: '48%' };
    }
    return { height: '100%' };
  }, [isCompactLayout]);

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden">
      <div className="flex-none px-2 py-1 bg-slate-50 border-b border-slate-200 text-[10px] text-slate-600 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-700">Demo Guide</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-200 border border-red-300" /> Red</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-200 border border-amber-300" /> Amber</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-700 border border-amber-800" /> Brown</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-200 border border-emerald-300" /> Complete</span>
        <span className="inline-flex items-center gap-1"><span className="px-1 rounded border border-indigo-300 text-indigo-700 bg-indigo-50 text-[9px] font-semibold">MT+</span> Move task to Master Tracker</span>
        <span className="inline-flex items-center gap-1"><span className="px-1 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 text-[9px] font-semibold">AL+</span> Move task to Action Log</span>
      </div>

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

        {!isCompactLayout && (
          <div
            ref={resizerRef}
            className="w-1 bg-slate-200 hover:bg-indigo-400 cursor-col-resize z-30 transition-colors flex-none"
          />
        )}

        <div
          className={`flex flex-col overflow-hidden min-h-0 ${isCompactLayout ? 'flex-none' : 'flex-grow min-w-0'}`}
          style={rightPaneStyle}
        >
          <GanttChart tasks={visibleTasks} viewMode={viewMode} baseline={baseline} />
        </div>
      </div>
    </div>
  );
};

export default ScheduleView;
