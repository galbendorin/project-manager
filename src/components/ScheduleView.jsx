import React, { useRef, useEffect, useCallback } from 'react';
import ScheduleGrid from './ScheduleGrid';
import GanttChart from './GanttChart';

const ScheduleView = ({ 
  tasks,
  viewMode,
  baseline,
  onUpdateTask,
  onDeleteTask,
  onModifyHierarchy,
  onToggleTrack,
  onInsertTask
}) => {
  const leftPanelRef = useRef(null);
  const resizerRef = useRef(null);
  const scrollSourceRef = useRef(null);

  // Panel resizing logic
  useEffect(() => {
    const resizer = resizerRef.current;
    const leftPanel = leftPanelRef.current;
    let isResizing = false;

    const handleMouseDown = () => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
    };

    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const containerWidth = window.innerWidth;
      const newWidthPct = (e.clientX / containerWidth) * 100;
      if (newWidthPct > 25 && newWidthPct < 85) {
        leftPanel.style.width = `${newWidthPct}%`;
      }
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
  }, []);

  // Synchronized vertical scrolling
  useEffect(() => {
    const timer = setTimeout(() => {
      const gridScroll = document.getElementById('grid-scroll');
      const chartScroll = document.getElementById('chart-scroll');
      if (!gridScroll || !chartScroll) return;

      const syncScroll = (source, target) => {
        return () => {
          if (scrollSourceRef.current && scrollSourceRef.current !== source) return;
          scrollSourceRef.current = source;
          target.scrollTop = source.scrollTop;
          requestAnimationFrame(() => {
            scrollSourceRef.current = null;
          });
        };
      };

      const handleGridScroll = syncScroll(gridScroll, chartScroll);
      const handleChartScroll = syncScroll(chartScroll, gridScroll);

      gridScroll.addEventListener('scroll', handleGridScroll, { passive: true });
      chartScroll.addEventListener('scroll', handleChartScroll, { passive: true });

      return () => {
        gridScroll.removeEventListener('scroll', handleGridScroll);
        chartScroll.removeEventListener('scroll', handleChartScroll);
      };
    }, 150);

    return () => clearTimeout(timer);
  }, [tasks]);

  return (
    <div className="flex overflow-hidden w-full h-full bg-white">
      {/* Left Panel - Task Grid */}
      <div
        ref={leftPanelRef}
        className="flex-none border-r border-slate-200 bg-white flex flex-col overflow-hidden z-20"
        style={{ width: '55%', minWidth: '600px', height: '100%' }}
      >
        <ScheduleGrid
          tasks={tasks}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onModifyHierarchy={onModifyHierarchy}
          onToggleTrack={onToggleTrack}
          onInsertTask={onInsertTask}
        />
      </div>

      {/* Resizer */}
      <div
        ref={resizerRef}
        className="w-1 bg-slate-200 hover:bg-indigo-400 cursor-col-resize z-30 transition-colors flex-none"
      />

      {/* Right Panel - Gantt Chart */}
      <div className="flex-grow flex flex-col overflow-hidden" style={{ height: '100%' }}>
        <GanttChart tasks={tasks} viewMode={viewMode} baseline={baseline} />
      </div>
    </div>
  );
};

export default ScheduleView;
