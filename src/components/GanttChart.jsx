import React, { useEffect, useRef, useMemo, useState } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { getProjectDateRange, calculateCriticalPath, getCalendarSpan, parseDateValue, formatDateDDMMMyy, getTaskDependencies } from '../utils/helpers';

// Plugin: Row stripes
const rowStripesPlugin = {
  id: 'rowStripes',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const yScale = chart.scales.y;
    if (!yScale || !chartArea) return;
    const labels = chart.data.labels || [];
    if (labels.length === 0) return;
    ctx.save();
    for (let i = 0; i < labels.length; i++) {
      const y = yScale.getPixelForValue(i);
      const rowHeight = yScale.getPixelForValue(1) - yScale.getPixelForValue(0);
      const halfRow = Math.abs(rowHeight) / 2;
      const top = y - halfRow;
      if (i % 2 === 1) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, Math.abs(rowHeight));
      }
      ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, top + Math.abs(rowHeight));
      ctx.lineTo(chartArea.right, top + Math.abs(rowHeight));
      ctx.stroke();
    }
    ctx.restore();
  }
};

// Plugin: Weekend shading
const weekendShadingPlugin = {
  id: 'weekendShading',
  beforeDatasetsDraw(chart, args, options) {
    if (options?.compact) return;
    const { ctx, chartArea } = chart;
    const xScale = chart.scales.x;
    if (!xScale || !chartArea) return;

    ctx.save();
    ctx.fillStyle = 'rgba(241, 245, 249, 0.6)';

    const minTime = xScale.min;
    const maxTime = xScale.max;
    const d = new Date(minTime);
    d.setHours(0, 0, 0, 0);

    while (d.getTime() <= maxTime) {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) {
        const x1 = xScale.getPixelForValue(d.getTime());
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        const x2 = xScale.getPixelForValue(nextDay.getTime());
        if (x2 > chartArea.left && x1 < chartArea.right) {
          ctx.fillRect(
            Math.max(x1, chartArea.left),
            chartArea.top,
            Math.min(x2, chartArea.right) - Math.max(x1, chartArea.left),
            chartArea.bottom - chartArea.top
          );
        }
      }
      d.setDate(d.getDate() + 1);
    }
    ctx.restore();
  }
};

// Plugin: Dependency lines, baseline ghost bars, summary bracket bars
const ganttOverlayPlugin = {
  id: 'ganttOverlay',
  afterDatasetsDraw(chart, args, options) {
    const { ctx } = chart;
    const tasks = options.tasks || [];
    const criticalIds = options.criticalIds || new Set();
    const baseline = options.baseline || null;
    const compact = !!options.compact;
    if (tasks.length === 0) return;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;
    const taskIndexById = new Map(tasks.map((task, idx) => [task.id, idx]));
    const barHeight = yScale.getPixelForValue(1) - yScale.getPixelForValue(0);
    const halfBar = Math.abs(barHeight) * 0.275;
    ctx.save();

    // SUMMARY / GROUP BARS
    tasks.forEach((task, taskIndex) => {
      if (!task._isParent) return;
      const y = yScale.getPixelForValue(taskIndex);
      if (y == null) return;
      const calDays = task._calendarDays || getCalendarSpan(task.start, task.dur) || 0;
      const parsedStart = parseDateValue(task.start);
      if (!parsedStart) return;
      const startX = xScale.getPixelForValue(parsedStart.getTime());
      const endX = xScale.getPixelForValue(parsedStart.getTime() + calDays * 86400000);
      if (startX == null || endX == null) return;
      const width = endX - startX;
      if (width <= 0) return;

      const barColor = '#1e293b';
      const barThickness = 5;
      const triangleSize = 7;
      const barY = y - barThickness / 2;

      ctx.fillStyle = barColor;
      ctx.fillRect(startX, barY, width, barThickness);

      ctx.beginPath();
      ctx.moveTo(startX, barY + barThickness);
      ctx.lineTo(startX + triangleSize, barY + barThickness);
      ctx.lineTo(startX, barY + barThickness + triangleSize);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(endX, barY + barThickness);
      ctx.lineTo(endX - triangleSize, barY + barThickness);
      ctx.lineTo(endX, barY + barThickness + triangleSize);
      ctx.closePath();
      ctx.fill();
    });

    // BASELINE GHOST BARS
    if (!compact && baseline && baseline.length > 0) {
      const baselineMap = new Map(baseline.map(b => [b.id, b]));
      tasks.forEach((task, taskIndex) => {
        if (task._isParent) return;
        const bl = baselineMap.get(task.id);
        if (!bl) return;
        const y = yScale.getPixelForValue(taskIndex);
        if (y == null) return;
        const blCalDays = getCalendarSpan(bl.start, bl.dur) || 0;
        const blStart = parseDateValue(bl.start);
        if (!blStart) return;
        const blStartX = xScale.getPixelForValue(blStart.getTime());
        const blEndX = xScale.getPixelForValue(blStart.getTime() + blCalDays * 86400000);
        if (blStartX == null || blEndX == null) return;
        const ghostHeight = halfBar * 0.6;
        const ghostY = y + halfBar + 2;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        const w = blEndX - blStartX;
        if (w > 0) {
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(blStartX, ghostY, w, ghostHeight, 4);
          } else {
            ctx.rect(blStartX, ghostY, w, ghostHeight);
          }
          ctx.fill();
          ctx.stroke();
        }
        ctx.setLineDash([]);
      });
    }

    // DEPENDENCY LINES
    if (!compact) tasks.forEach((task, taskIndex) => {
      const deps = getTaskDependencies(task);
      if (deps.length === 0) return;

      deps.forEach((dep) => {
        const predIndex = taskIndexById.get(dep.parentId);
        if (predIndex === undefined) return;

        const predTask = tasks[predIndex];
        const predY = yScale.getPixelForValue(predIndex);
        const succY = yScale.getPixelForValue(taskIndex);
        if (predY == null || succY == null) return;

        const depType = dep.depType || 'FS';
        const predCalDays = predTask._calendarDays || getCalendarSpan(predTask.start, predTask.dur) || 0.5;
        const succCalDays = task._calendarDays || getCalendarSpan(task.start, task.dur) || 0.5;
        const predStartDate = parseDateValue(predTask.start);
        const succStartDate = parseDateValue(task.start);
        if (!predStartDate || !succStartDate) return;

        const predStart = predStartDate.getTime();
        const predEnd = predStart + predCalDays * 86400000;
        const succStart = succStartDate.getTime();
        const succEnd = succStart + succCalDays * 86400000;

        let fromX;
        let toX;
        switch (depType) {
          case 'FS': fromX = xScale.getPixelForValue(predEnd); toX = xScale.getPixelForValue(succStart); break;
          case 'SS': fromX = xScale.getPixelForValue(predStart); toX = xScale.getPixelForValue(succStart); break;
          case 'FF': fromX = xScale.getPixelForValue(predEnd); toX = xScale.getPixelForValue(succEnd); break;
          case 'SF': fromX = xScale.getPixelForValue(predStart); toX = xScale.getPixelForValue(succEnd); break;
          default: fromX = xScale.getPixelForValue(predEnd); toX = xScale.getPixelForValue(succStart);
        }
        if (fromX == null || toX == null) return;

        const isCriticalLink = criticalIds.has(task.id) && criticalIds.has(predTask.id);
        ctx.strokeStyle = isCriticalLink ? '#7C3AED' : '#94a3b8';
        ctx.lineWidth = isCriticalLink ? 2 : 1;
        ctx.setLineDash([]);

        const goingDown = succY > predY;
        const sX = fromX;
        const sY = goingDown ? predY + halfBar : predY - halfBar;
        const eX = toX;
        const eY = succY;

        ctx.beginPath();
        if (Math.abs(succY - predY) < 2) {
          ctx.moveTo(fromX + 2, predY);
          ctx.lineTo(toX - 2, predY);
        } else if (eX > sX + 10) {
          ctx.moveTo(sX, sY);
          ctx.lineTo(sX, eY);
          ctx.lineTo(eX - 2, eY);
        } else {
          const jogX = Math.min(sX, eX) - 15;
          ctx.moveTo(sX, sY);
          ctx.lineTo(sX, sY + (goingDown ? 10 : -10));
          ctx.lineTo(jogX, sY + (goingDown ? 10 : -10));
          ctx.lineTo(jogX, eY);
          ctx.lineTo(eX - 2, eY);
        }
        ctx.stroke();

        const arrowX = Math.abs(succY - predY) < 2 ? toX - 2 : eX - 2;
        const arrowY = Math.abs(succY - predY) < 2 ? predY : eY;
        ctx.fillStyle = isCriticalLink ? '#7C3AED' : '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - 6, arrowY - 3);
        ctx.lineTo(arrowX - 6, arrowY + 3);
        ctx.closePath();
        ctx.fill();
      });
    });

    ctx.restore();
  }
};

Chart.register(rowStripesPlugin);
Chart.register(weekendShadingPlugin);
Chart.register(ganttOverlayPlugin);

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 55;

const GanttChart = ({ tasks, viewMode = 'week', baseline = null }) => {
  const canvasRef = useRef(null);
  const axisCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const axisInstanceRef = useRef(null);
  const containerRef = useRef(null);
  const axisContainerRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const [todayMarkerX, setTodayMarkerX] = useState(null);
  const [showTodayMarker, setShowTodayMarker] = useState(false);

  const criticalPathIds = useMemo(() => {
    if ((tasks?.length || 0) > 250) return new Set();
    return calculateCriticalPath(tasks);
  }, [tasks]);

  // Sync horizontal scroll
  useEffect(() => {
    const bodyEl = bodyScrollRef.current;
    const headerEl = axisContainerRef.current;
    if (!bodyEl || !headerEl) return;
    const handleBodyScroll = () => { headerEl.scrollLeft = bodyEl.scrollLeft; };
    bodyEl.addEventListener('scroll', handleBodyScroll, { passive: true });
    return () => bodyEl.removeEventListener('scroll', handleBodyScroll);
  }, [tasks]);

  useEffect(() => {
    if (!canvasRef.current || !axisCanvasRef.current || tasks.length === 0) {
      setTodayMarkerX(null);
      setShowTodayMarker(false);
      return;
    }
    const { minDate, maxDate } = getProjectDateRange(tasks);
    const rangeDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000));
    // Enter compact mode earlier to keep scrolling responsive on large, long-range plans.
    const isHeavyPlan = rangeDays > 365 || tasks.length > 90;
    const basePxPerDay = isHeavyPlan
      ? (viewMode === 'week' ? 14 : (viewMode === '2week' ? 10 : 6))
      : (viewMode === 'week' ? 36 : (viewMode === '2week' ? 18 : 9));

    // Keep charts responsive for very large plans by hard-capping CSS width.
    const maxCssCanvas = isHeavyPlan ? 3200 : 8000;
    const safePxPerDay = Math.max(isHeavyPlan ? 1 : 2, Math.min(basePxPerDay, maxCssCanvas / rangeDays));
    const compactMode = isHeavyPlan;

    const viewportWidth = containerRef.current?.parentElement?.clientWidth || 800;
    const desiredWidth = Math.max(viewportWidth, Math.floor(rangeDays * safePxPerDay));
    const chartWidth = Math.min(desiredWidth, maxCssCanvas);
    const chartHeight = tasks.length * ROW_HEIGHT;

    if (containerRef.current) { containerRef.current.style.width = `${chartWidth}px`; containerRef.current.style.height = `${chartHeight}px`; }
    if (axisCanvasRef.current?.parentElement) { axisCanvasRef.current.parentElement.style.width = `${chartWidth}px`; }

    const regularTasks = tasks.filter(t => t.type !== 'Milestone' && !t._isParent);
    const milestones = tasks.filter(t => t.type === 'Milestone');

    // Use calendar days for bar rendering (so bars span weekends visually)
    const taskData = regularTasks.map(task => {
      const start = parseDateValue(task.start);
      if (!start) return null;
      const startTime = start.getTime();
      const calDays = task._calendarDays || getCalendarSpan(task.start, task.dur) || 0.5;
      const duration = calDays * 86400000;
      return { x: [startTime, startTime + duration], y: task.name, pct: task.pct, taskId: task.id };
    }).filter(Boolean);

    const milestoneData = milestones.map(task => {
      const start = parseDateValue(task.start);
      if (!start) return null;
      return { x: start.getTime(), y: task.name, taskId: task.id };
    }).filter(Boolean);
    const taskById = new Map(tasks.map(task => [task.id, task]));

    if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    if (axisInstanceRef.current) axisInstanceRef.current.destroy();

    const datasets = [];
    if (taskData.length > 0) {
      datasets.push({
        type: 'bar', data: taskData,
        backgroundColor: (ctx) => {
          const raw = ctx.raw;
          if (!raw) return '#e2e8f0';
          if (raw.pct === 100) return '#34d399';
          if (raw.pct > 0) return '#6366f1';
          return '#cbd5e1';
        },
        borderRadius: 4, barPercentage: 0.5
      });
    }
    if (milestoneData.length > 0) {
      datasets.push({
        type: 'scatter', data: milestoneData,
        backgroundColor: '#f59e0b', borderColor: '#d97706', borderWidth: 2,
        pointStyle: 'rectRot', radius: compactMode ? 5 : 7, hoverRadius: compactMode ? 6 : 9
      });
    }

    chartInstanceRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels: tasks.map(t => t.name), datasets },
      options: {
        animation: false,
        events: isHeavyPlan ? [] : undefined,
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 0, bottom: 0, left: 0, right: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: !compactMode,
            backgroundColor: '#1e293b', titleFont: { size: 11 }, bodyFont: { size: 11 }, padding: 8, cornerRadius: 6,
            callbacks: {
              label: (context) => {
                const taskId = context.raw?.taskId;
                const task = taskById.get(taskId);
                if (!task) return '';
                const isCritical = criticalPathIds.has(task.id);
                const displayStart = formatDateDDMMMyy(task.start) || task.start;
                if (task._isParent) return [`Summary: ${task.name}`, `Start: ${displayStart}`, `Duration: ${task.dur} business days`, ...(isCritical ? ['◆ Critical Path'] : [])];
                if (task.type === 'Milestone') return [`Milestone: ${task.name}`, `Date: ${displayStart}`, ...(isCritical ? ['◆ Critical Path'] : [])];
                return [`Task: ${task.name}`, `Start: ${displayStart}`, `Duration: ${task.dur} business days`, `Progress: ${task.pct}%`, ...(isCritical ? ['◆ Critical Path'] : [])];
              }
            }
          },
          weekendShading: { compact: compactMode },
          ganttOverlay: { tasks, criticalIds: criticalPathIds, baseline, compact: compactMode }
        },
        scales: {
          x: { type: 'time', min: minDate.getTime(), max: maxDate.getTime(),
            time: { unit: viewMode === 'week' ? 'day' : (viewMode === '2week' ? 'week' : 'month'), displayFormats: { day: 'MMM d', week: 'MMM d', month: 'MMM yyyy' } },
            display: false },
          y: { display: false, beginAtZero: true }
        }
      }
    });

    axisInstanceRef.current = new Chart(axisCanvasRef.current, {
      type: 'bar',
      data: { labels: [''], datasets: [] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        layout: { padding: { left: 0, right: 0, top: 0, bottom: 0 } },
        plugins: { legend: { display: false }, ganttOverlay: false, rowStripes: false, todayLine: false, weekendShading: false },
        scales: {
          x: { type: 'time', min: minDate.getTime(), max: maxDate.getTime(), position: 'bottom',
            time: { unit: viewMode === 'week' ? 'day' : (viewMode === '2week' ? 'week' : 'month'), displayFormats: { day: 'MMM d', week: 'MMM d', month: 'MMM yyyy' } },
            ticks: { font: { size: 12, weight: '600' }, color: '#64748b', maxRotation: 0, autoSkip: true },
            grid: { color: '#e2e8f0', lineWidth: 1 } },
          y: { display: false }
        }
      }
    });

    const bodyScale = chartInstanceRef.current?.scales?.x;
    const bodyArea = chartInstanceRef.current?.chartArea;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const markerX = bodyScale ? bodyScale.getPixelForValue(today.getTime()) : null;
    if (Number.isFinite(markerX) && bodyArea && markerX >= bodyArea.left && markerX <= bodyArea.right) {
      setTodayMarkerX(markerX);
      setShowTodayMarker(true);
    } else {
      setTodayMarkerX(null);
      setShowTodayMarker(false);
    }

    return () => { if (chartInstanceRef.current) chartInstanceRef.current.destroy(); if (axisInstanceRef.current) axisInstanceRef.current.destroy(); };
  }, [tasks, viewMode, criticalPathIds, baseline]);

  return (
    <div className="flex-grow flex flex-col bg-white relative min-w-0 overflow-hidden">
      <div ref={axisContainerRef} className="flex-none overflow-hidden bg-slate-50 border-b-2 border-slate-200" style={{ height: `${HEADER_HEIGHT}px` }}>
        <div className="relative" style={{ height: `${HEADER_HEIGHT}px`, minWidth: '100%' }}>
          <canvas ref={axisCanvasRef} style={{ height: `${HEADER_HEIGHT}px` }} />
          {showTodayMarker && todayMarkerX !== null && (
            <>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-500 pointer-events-none z-20"
                style={{ left: `${todayMarkerX}px` }}
              />
              <div
                className="absolute top-1 -translate-x-1/2 text-[10px] font-bold text-rose-500 pointer-events-none z-20"
                style={{ left: `${todayMarkerX}px` }}
              >
                TODAY
              </div>
            </>
          )}
        </div>
      </div>
      <div ref={bodyScrollRef} className="flex-grow overflow-auto custom-scrollbar" id="chart-scroll">
        <div ref={containerRef} className="relative">
          <canvas ref={canvasRef} />
          {showTodayMarker && todayMarkerX !== null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 pointer-events-none z-20"
              style={{ left: `${todayMarkerX}px` }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(GanttChart);
