import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { getProjectDateRange, calculateCriticalPath } from '../utils/helpers';

// Plugin: Alternating row backgrounds
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
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, top + Math.abs(rowHeight));
      ctx.lineTo(chartArea.right, top + Math.abs(rowHeight));
      ctx.stroke();
    }
    ctx.restore();
  }
};

// Plugin: Today line
const todayLinePlugin = {
  id: 'todayLine',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const xScale = chart.scales.x;
    if (!xScale || !chartArea) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayX = xScale.getPixelForValue(today.getTime());
    if (todayX < chartArea.left || todayX > chartArea.right) return;

    ctx.save();
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(todayX, chartArea.top);
    ctx.lineTo(todayX, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // "Today" label
    ctx.fillStyle = '#EF4444';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Today', todayX, chartArea.top - 4);
    ctx.beginPath();
    ctx.moveTo(todayX, chartArea.top);
    ctx.lineTo(todayX - 4, chartArea.top - 2);
    ctx.lineTo(todayX + 4, chartArea.top - 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
};

// Plugin: Dependency lines and baseline ghost bars
const ganttOverlayPlugin = {
  id: 'ganttOverlay',
  afterDatasetsDraw(chart, args, options) {
    const { ctx } = chart;
    const tasks = options.tasks || [];
    const criticalIds = options.criticalIds || new Set();
    const baseline = options.baseline || null;
    if (tasks.length === 0) return;

    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;

    const barHeight = yScale.getPixelForValue(1) - yScale.getPixelForValue(0);
    const halfBar = Math.abs(barHeight) * 0.275;

    ctx.save();

    // Baseline ghost bars
    if (baseline && baseline.length > 0) {
      const baselineMap = new Map(baseline.map(b => [b.id, b]));
      tasks.forEach((task, taskIndex) => {
        const bl = baselineMap.get(task.id);
        if (!bl) return;
        const y = yScale.getPixelForValue(taskIndex);
        if (y == null) return;
        const blStartX = xScale.getPixelForValue(new Date(bl.start).getTime());
        const blEndX = xScale.getPixelForValue(new Date(bl.start).getTime() + (bl.dur || 0) * 86400000);
        if (blStartX == null || blEndX == null) return;

        const ghostHeight = halfBar * 0.6;
        const ghostY = y + halfBar + 2;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        const width = blEndX - blStartX;
        if (width > 0) {
          ctx.beginPath();
          ctx.roundRect(blStartX, ghostY, width, ghostHeight, 4);
          ctx.fill();
          ctx.stroke();
        }
        ctx.setLineDash([]);
      });
    }

    // Dependency lines
    tasks.forEach((task, taskIndex) => {
      if (!task.parent) return;
      const predIndex = tasks.findIndex(t => t.id === task.parent);
      if (predIndex === -1) return;
      const predTask = tasks[predIndex];

      const predY = yScale.getPixelForValue(predIndex);
      const succY = yScale.getPixelForValue(taskIndex);
      if (predY == null || succY == null) return;

      const depType = task.depType || 'FS';
      const predStart = new Date(predTask.start).getTime();
      const predEnd = predStart + (predTask.dur || 0.5) * 86400000;
      const succStart = new Date(task.start).getTime();
      const succEnd = succStart + (task.dur || 0.5) * 86400000;

      let fromX, toX;
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
      const startX = fromX;
      const startY = goingDown ? predY + halfBar : predY - halfBar;
      const endX = toX;
      const endY = succY;

      ctx.beginPath();
      if (Math.abs(succY - predY) < 2) {
        ctx.moveTo(fromX + 2, predY);
        ctx.lineTo(toX - 2, predY);
      } else if (endX > startX + 10) {
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, endY);
        ctx.lineTo(endX - 2, endY);
      } else {
        const jogX = Math.min(startX, endX) - 15;
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, startY + (goingDown ? 10 : -10));
        ctx.lineTo(jogX, startY + (goingDown ? 10 : -10));
        ctx.lineTo(jogX, endY);
        ctx.lineTo(endX - 2, endY);
      }
      ctx.stroke();

      const arrowLen = 6;
      const arrowWidth = 3;
      const arrowX = Math.abs(succY - predY) < 2 ? toX - 2 : endX - 2;
      const arrowY = Math.abs(succY - predY) < 2 ? predY : endY;
      ctx.fillStyle = isCriticalLink ? '#7C3AED' : '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - arrowLen, arrowY - arrowWidth);
      ctx.lineTo(arrowX - arrowLen, arrowY + arrowWidth);
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();
  }
};

Chart.register(rowStripesPlugin);
Chart.register(ganttOverlayPlugin);
Chart.register(todayLinePlugin);

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 44;

const GanttChart = ({ tasks, viewMode = 'week', baseline = null }) => {
  const canvasRef = useRef(null);
  const headerCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const containerRef = useRef(null);
  const headerContainerRef = useRef(null);
  const bodyScrollRef = useRef(null);

  const criticalPathIds = useMemo(() => calculateCriticalPath(tasks), [tasks]);

  // Draw custom timeline header
  const drawHeader = useCallback((minDate, maxDate, chartWidth) => {
    const canvas = headerCanvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = chartWidth * dpr;
    canvas.height = HEADER_HEIGHT * dpr;
    canvas.style.width = `${chartWidth}px`;
    canvas.style.height = `${HEADER_HEIGHT}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const totalMs = maxDate.getTime() - minDate.getTime();
    const msPerPx = totalMs / chartWidth;
    const msPerDay = 86400000;

    // Clear
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, chartWidth, HEADER_HEIGHT);

    // Bottom border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT - 0.5);
    ctx.lineTo(chartWidth, HEADER_HEIGHT - 0.5);
    ctx.stroke();

    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (viewMode === 'week') {
      // Daily columns: top row = month/year, bottom row = day number + day name
      const startDay = new Date(minDate);
      startDay.setHours(0, 0, 0, 0);

      let currentDate = new Date(startDay);
      let lastMonth = -1;

      while (currentDate <= maxDate) {
        const x = (currentDate.getTime() - minDate.getTime()) / msPerPx;
        const nextDay = new Date(currentDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextX = (nextDay.getTime() - minDate.getTime()) / msPerPx;
        const colWidth = nextX - x;

        // Vertical gridline
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEADER_HEIGHT);
        ctx.stroke();

        // Month label (top row) - show at start of each month
        if (currentDate.getMonth() !== lastMonth) {
          lastMonth = currentDate.getMonth();
          ctx.fillStyle = '#334155';
          ctx.font = 'bold 10px -apple-system, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`, x + 4, 14);
        }

        // Weekend shading
        const dow = currentDate.getDay();
        if (dow === 0 || dow === 6) {
          ctx.fillStyle = 'rgba(241, 245, 249, 0.8)';
          ctx.fillRect(x, 18, colWidth, HEADER_HEIGHT - 18);
        }

        // Today highlight
        const isToday = currentDate.getTime() === today.getTime();
        if (isToday) {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
          ctx.fillRect(x, 0, colWidth, HEADER_HEIGHT);
        }

        // Day number + abbreviated name (bottom row)
        ctx.fillStyle = isToday ? '#EF4444' : (dow === 0 || dow === 6 ? '#94a3b8' : '#64748b');
        ctx.font = isToday ? 'bold 10px -apple-system, sans-serif' : '10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        const label = `${currentDate.getDate()} ${dayOfWeek[dow]}`;
        ctx.fillText(label, x + colWidth / 2, 34);

        currentDate = nextDay;
      }
    } else if (viewMode === '2week') {
      // Show every other day label to reduce clutter
      const startDay = new Date(minDate);
      startDay.setHours(0, 0, 0, 0);

      let currentDate = new Date(startDay);
      let lastMonth = -1;
      let dayCount = 0;

      while (currentDate <= maxDate) {
        const x = (currentDate.getTime() - minDate.getTime()) / msPerPx;
        const nextDay = new Date(currentDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextX = (nextDay.getTime() - minDate.getTime()) / msPerPx;
        const colWidth = nextX - x;

        // Vertical gridline every Monday
        if (currentDate.getDay() === 1) {
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, HEADER_HEIGHT);
          ctx.stroke();
        }

        // Month label
        if (currentDate.getMonth() !== lastMonth) {
          lastMonth = currentDate.getMonth();
          ctx.fillStyle = '#334155';
          ctx.font = 'bold 10px -apple-system, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`, x + 4, 14);
        }

        // Show label every 2 days
        if (dayCount % 2 === 0) {
          const isToday = currentDate.getTime() === today.getTime();
          ctx.fillStyle = isToday ? '#EF4444' : '#64748b';
          ctx.font = '9px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}`, x + colWidth, 34);
        }

        dayCount++;
        currentDate = nextDay;
      }
    } else {
      // Monthly view - show week starts
      const startDay = new Date(minDate);
      startDay.setHours(0, 0, 0, 0);

      // Find first Monday
      while (startDay.getDay() !== 1) {
        startDay.setDate(startDay.getDate() + 1);
      }

      let currentDate = new Date(startDay);
      let lastMonth = -1;

      while (currentDate <= maxDate) {
        const x = (currentDate.getTime() - minDate.getTime()) / msPerPx;

        // Vertical gridline
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 18);
        ctx.lineTo(x, HEADER_HEIGHT);
        ctx.stroke();

        // Month label
        if (currentDate.getMonth() !== lastMonth) {
          lastMonth = currentDate.getMonth();
          ctx.fillStyle = '#334155';
          ctx.font = 'bold 10px -apple-system, sans-serif';
          ctx.textAlign = 'left';

          // Stronger gridline at month boundary
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, HEADER_HEIGHT);
          ctx.stroke();

          ctx.fillText(`${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`, x + 4, 14);
        }

        // Week label
        ctx.fillStyle = '#64748b';
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        const nextWeek = new Date(currentDate);
        nextWeek.setDate(nextWeek.getDate() + 7);
        const weekX = (x + (nextWeek.getTime() - minDate.getTime()) / msPerPx) / 2;
        ctx.fillText(`${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}`, weekX, 34);

        currentDate.setDate(currentDate.getDate() + 7);
      }
    }

    // Today line on header
    const todayX = (today.getTime() - minDate.getTime()) / msPerPx;
    if (todayX >= 0 && todayX <= chartWidth) {
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(todayX, 0);
      ctx.lineTo(todayX, HEADER_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);
    }

  }, [viewMode]);

  // Sync horizontal scroll
  useEffect(() => {
    const bodyEl = bodyScrollRef.current;
    const headerEl = headerContainerRef.current;
    if (!bodyEl || !headerEl) return;

    const handleScroll = () => {
      headerEl.scrollLeft = bodyEl.scrollLeft;
    };

    bodyEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => bodyEl.removeEventListener('scroll', handleScroll);
  }, [tasks]);

  useEffect(() => {
    if (!canvasRef.current || tasks.length === 0) return;

    const { minDate, maxDate } = getProjectDateRange(tasks);

    const pxPerDay = viewMode === 'week' ? 36 : (viewMode === '2week' ? 18 : 9);
    const chartWidth = Math.max(
      containerRef.current?.parentElement?.clientWidth || 800,
      ((maxDate - minDate) / 86400000) * pxPerDay
    );

    const chartHeight = tasks.length * ROW_HEIGHT;

    if (containerRef.current) {
      containerRef.current.style.width = `${chartWidth}px`;
      containerRef.current.style.height = `${chartHeight}px`;
    }

    // Draw custom header
    drawHeader(minDate, maxDate, chartWidth);

    const regularTasks = tasks.filter(t => t.type !== 'Milestone');
    const milestones = tasks.filter(t => t.type === 'Milestone');

    const taskData = regularTasks.map(task => {
      const startTime = new Date(task.start).getTime();
      const duration = (task.dur || 0.5) * 86400000;
      return { x: [startTime, startTime + duration], y: task.name, pct: task.pct, taskId: task.id };
    });

    const milestoneData = milestones.map(task => ({
      x: new Date(task.start).getTime(), y: task.name, taskId: task.id
    }));

    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    const datasets = [];

    if (taskData.length > 0) {
      datasets.push({
        type: 'bar',
        data: taskData,
        backgroundColor: (ctx) => {
          const raw = ctx.raw;
          if (!raw) return '#e2e8f0';
          if (raw.pct === 100) return '#34d399';
          if (raw.pct > 0) return '#6366f1';
          return '#cbd5e1';
        },
        borderRadius: 4,
        barPercentage: 0.5
      });
    }

    if (milestoneData.length > 0) {
      datasets.push({
        type: 'scatter',
        data: milestoneData,
        backgroundColor: '#f59e0b',
        borderColor: '#d97706',
        borderWidth: 2,
        pointStyle: 'rectRot',
        radius: 7,
        hoverRadius: 9
      });
    }

    chartInstanceRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels: tasks.map(t => t.name), datasets },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 12, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            titleFont: { size: 11 },
            bodyFont: { size: 11 },
            padding: 8,
            cornerRadius: 6,
            callbacks: {
              label: (context) => {
                const taskName = context.label;
                const task = tasks.find(t => t.name === taskName);
                if (!task) return '';
                const isCritical = criticalPathIds.has(task.id);
                if (task.type === 'Milestone') {
                  return [`Milestone: ${task.name}`, `Date: ${task.start}`, ...(isCritical ? ['◆ Critical Path'] : [])];
                }
                return [`Task: ${task.name}`, `Start: ${task.start}`, `Duration: ${task.dur} days`, `Progress: ${task.pct}%`, ...(isCritical ? ['◆ Critical Path'] : [])];
              }
            }
          },
          ganttOverlay: { tasks, criticalIds: criticalPathIds, baseline }
        },
        scales: {
          x: {
            type: 'time',
            min: minDate.getTime(),
            max: maxDate.getTime(),
            time: {
              unit: viewMode === 'week' ? 'day' : (viewMode === '2week' ? 'week' : 'month'),
              displayFormats: { day: 'MMM d', week: 'MMM d', month: 'MMM yyyy' }
            },
            display: false
          },
          y: { display: false, beginAtZero: true }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    };
  }, [tasks, viewMode, criticalPathIds, baseline, drawHeader]);

  return (
    <div className="flex-grow flex flex-col bg-white relative min-w-0 overflow-hidden">
      {/* Custom timeline header */}
      <div
        ref={headerContainerRef}
        className="flex-none overflow-hidden"
        style={{ height: `${HEADER_HEIGHT}px` }}
      >
        <canvas ref={headerCanvasRef} />
      </div>
      {/* Chart body */}
      <div ref={bodyScrollRef} className="flex-grow overflow-auto custom-scrollbar" id="chart-scroll">
        <div ref={containerRef} className="relative">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
};

export default GanttChart;
