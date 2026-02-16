import React, { useRef, useEffect } from 'react';
import ScheduleGrid from './ScheduleGrid';
import GanttChart from './GanttChart';

const ScheduleView = ({ 
  tasks,
  viewMode,
  onUpdateTask,
  onDeleteTask,
  onModifyHierarchy,
  onToggleTrack,
  onInsertTask
}) => {
  const leftPanelRef = useRef(null);
  const resizerRef = useRef(null);
  const gridScrollRef = useRef(null);
  const chartScrollRef = useRef(null);

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

  // Synchronized scrolling
  useEffect(() => {
    const gridScroll = gridScrollRef.current;
    const chartScroll = document.getElementById('chart-scroll');

    if (!gridScroll || !chartScroll) return;

    const handleGridScroll = () => {
      if (chartScroll) {
        chartScroll.scrollTop = gridScroll.scrollTop;
      }
    };

    const handleChartScroll = () => {
      if (gridScroll) {
        gridScroll.scrollTop = chartScroll.scrollTop;
      }
    };

    gridScroll.addEventListener('scroll', handleGridScroll);
    chartScroll.addEventListener('scroll', handleChartScroll);

    return () => {
      gridScroll.removeEventListener('scroll', handleGridScroll);
      chartScroll.removeEventListener('scroll', handleChartScroll);
    };
  }, []);

  return (
    <div className="flex-grow flex overflow-hidden w-full h-full bg-white">
      {/* Left Panel - Task Grid */}
      <div
        ref={leftPanelRef}
        className="flex-none border-r border-slate-200 bg-white flex flex-col z-20"
        style={{ width: '58%', minWidth: '650px' }}
      >
        <div ref={gridScrollRef}>
          <ScheduleGrid
            tasks={tasks}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
            onModifyHierarchy={onModifyHierarchy}
            onToggleTrack={onToggleTrack}
            onInsertTask={onInsertTask}
          />
        </div>
      </div>

      {/* Resizer */}
      <div
        ref={resizerRef}
        className="w-1 bg-slate-100 hover:bg-indigo-400 cursor-col-resize z-30 transition-colors"
      />

      {/* Right Panel - Gantt Chart */}
      <div ref={chartScrollRef}>
        <GanttChart tasks={tasks} viewMode={viewMode} />
      </div>
    </div>
  );
};

export default ScheduleView;
