import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ScheduleGrid from './ScheduleGrid';
import GanttChart from './GanttChart';
import AiAssistantPanel from './AiAssistantPanel';
import { buildVisibleTasks } from '../utils/helpers';
import { usePlan } from '../contexts/PlanContext';

const ScheduleView = ({ 
  tasks,
  viewMode,
  baseline,
  isMobile = false,
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
  isInTracker,
  aiSettings,
  onApplyAiTasks,
  usePlatformKey
}) => {
  const { canUseAiAssistant } = usePlan();
  const resizerRef = useRef(null);
  const scrollSourceRef = useRef(null);
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState(55);
  const [showAiPanel, setShowAiPanel] = useState(false);

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

  const legendItems = [
    { label: 'Red', detail: 'Past deadline and not complete.' },
    { label: 'Amber', detail: 'Custom highlight for a row that needs attention.' },
    { label: 'Brown', detail: 'Custom highlight for dependency, decision, or review rows.' },
    { label: 'Complete', detail: 'Task is at 100% progress.' },
  ];

  const dependencyItems = [
    { code: 'FS', label: 'Finish to Start', detail: 'Task B starts after Task A finishes.' },
    { code: 'SS', label: 'Start to Start', detail: 'Task B starts when Task A starts.' },
    { code: 'FF', label: 'Finish to Finish', detail: 'Task B finishes when Task A finishes.' },
    { code: 'SF', label: 'Start to Finish', detail: 'Task B finishes when Task A starts.' },
  ];

  const workflowItems = [
    { badge: 'Track', label: 'Adds the schedule task to the task list / Action Log feed.' },
    { badge: 'MT+', label: 'Send the task to Master Tracker for closer control.' },
    { badge: 'AL+', label: 'Send the task to Action Log so it appears as an action item.' },
    { badge: 'CP', label: 'Critical Path marker. Delay here is likely to move the finish date.' },
  ];

  return (
    <div className="h-full w-full min-w-0 pm-surface-card flex flex-col overflow-hidden rounded-t-[26px]">
      {showLegend && (
        <div className="flex-none border-b border-slate-200 bg-[var(--pm-surface-soft)] px-3 py-3 text-[11px] text-slate-600">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-[200px] flex-1">
              <div className="font-semibold text-slate-800">Legend</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {legendItems.map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="font-semibold text-slate-700">{item.label}</div>
                    <div className="mt-1 text-slate-500">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-[220px] flex-1">
              <div className="font-semibold text-slate-800">Dependencies</div>
              <div className="mt-2 grid gap-2">
                {dependencyItems.map((item) => (
                  <div key={item.code} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="font-semibold text-slate-700">
                      {item.code} · {item.label}
                    </div>
                    <div className="mt-1 text-slate-500">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-[220px] flex-1">
              <div className="font-semibold text-slate-800">Helpful shortcuts</div>
              <div className="mt-2 grid gap-2">
                {workflowItems.map((item) => (
                  <div key={item.badge} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="font-semibold text-slate-700">{item.badge}</div>
                    <div className="mt-1 text-slate-500">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setShowLegend(false)} className="ml-auto text-slate-400 hover:text-slate-600 text-[11px] font-semibold">
              Close
            </button>
          </div>
        </div>
      )}

      {/* AI Assistant banner — only for plans with AI access */}
      {canUseAiAssistant && (
        <div className="pm-ai-banner flex-none px-3 sm:px-4 py-2.5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setShowAiPanel(true)}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-indigo-700 shadow-md transition-all hover:bg-indigo-50 hover:shadow-lg sm:w-auto sm:justify-start"
            >
              <span className="text-[16px]">🤖</span>
              AI Plan Assistant
              <span className="text-[10px] font-medium bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">NEW</span>
            </button>
            <span className="text-[12px] text-indigo-100 leading-snug hidden sm:inline">
              Build &amp; edit your project plan with text or voice — try <em className="text-white font-medium">"Add a 2-week testing phase"</em> or <em className="text-white font-medium">"Build me a product launch plan"</em>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!showLegend && (
              <button onClick={() => setShowLegend(true)} className="flex-none text-[10px] text-indigo-200 hover:text-white transition-colors whitespace-nowrap font-semibold">
                Legend
              </button>
            )}
          </div>
        </div>
      )}

      {/* AI Assistant Panel (slide-over drawer) */}
      <AiAssistantPanel
        isOpen={showAiPanel}
        onClose={() => setShowAiPanel(false)}
        aiSettings={aiSettings}
        currentTasks={tasks}
        onApplyTasks={onApplyAiTasks}
        onOpenSettings={() => { setShowAiPanel(false); }}
        usePlatformKey={usePlatformKey}
      />

          {isMobile && (
        <div className="sm:hidden flex-none border-b border-slate-200 bg-[var(--pm-surface-soft)] px-3 py-1.5 text-[11px] text-slate-500">
          Swipe sideways in the schedule grid to see all columns.
        </div>
      )}

      {/* Always side-by-side on desktop; grid-only on mobile */}
      <div className="flex-grow min-h-0 min-w-0 flex flex-row overflow-x-auto overflow-y-hidden">
        <div
          className="flex-none min-w-0 bg-white/75 flex flex-col overflow-hidden z-20 border-r border-slate-200"
          style={{
            width: isMobile ? '100%' : `${leftPaneWidthPct}%`,
            minWidth: isMobile ? 'auto' : '480px',
            height: '100%'
          }}
        >
          <ScheduleGrid
            allTasks={tasks}
            visibleTasks={visibleTasks}
            isMobile={isMobile}
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

        {!isMobile && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
};

export default ScheduleView;
