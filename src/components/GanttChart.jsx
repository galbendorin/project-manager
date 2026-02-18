import React, { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { getProjectDateRange, calculateCriticalPath } from '../utils/helpers';

// Plugin: Draw alternating row backgrounds and gridlines
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

      // Alternating background
      if (i % 2 === 1) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, Math.abs(rowHeight));
      }

      // Row border line at bottom of each row
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

// Plugin: Draw dependency lines, baseline ghost bars
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

    // --- Baseline ghost bars ---
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

    // --- Dependency lines ---
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

      // Arrowhead
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

// Register plugins
Chart.register(rowStripesPlugin);
Chart.register(ganttOverlayPlugin);

const ROW_HEIGHT = 36;

const GanttChart = ({ tasks, viewMode = 'week', baseline = null }) => {
  const canvasRef = useRef(null);
  const axisCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const axisInstanceRef = useRef(null);
  const containerRef = useRef(null);

  const criticalPathIds = useMemo(() => calculateCriticalPath(tasks), [tasks]);

  useEffect(() => {
    if (!canvasRef.current || !axisCanvasRef.current || tasks.length === 0) return;

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

    const regularTasks = tasks.filter(t => t.type !== 'Milestone');
    const milestones = tasks.filter(t => t.type === 'Milestone');

    const taskData = regularTasks.map(task => {
      const startTime = new Date(task.start).getTime();
      const duration = (task.dur || 0.5) * 86400000;
      return {
        x: [startTime, startTime + duration],
        y: task.name,
        pct: task.pct,
        taskId: task.id
      };
    });

    const milestoneData = milestones.map(task => ({
      x: new Date(task.start).getTime(),
      y: task.name,
      taskId: task.id
    }));

    if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    if (axisInstanceRef.current) axisInstanceRef.current.destroy();

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
      data: {
        labels: tasks.map(t => t.name),
        datasets
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 0, bottom: 0 }
        },
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
          ganttOverlay: {
            tasks,
            criticalIds: criticalPathIds,
            baseline
          }
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
          y: {
            display: false,
            beginAtZero: true
          }
        }
      }
    });

    // Axis chart (timeline header)
    axisInstanceRef.current = new Chart(axisCanvasRef.current, {
      type: 'bar',
      data: { labels: [''], datasets: [] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          ganttOverlay: false,
          rowStripes: false
        },
        scales: {
          x: {
            type: 'time',
            min: minDate.getTime(),
            max: maxDate.getTime(),
            position: 'top',
            time: {
              unit: viewMode === 'week' ? 'day' : (viewMode === '2week' ? 'week' : 'month'),
              displayFormats: { day: 'MMM d', week: 'MMM d', month: 'MMM yyyy' }
            },
            ticks: {
              font: { size: 10, weight: '600' },
              color: '#64748b'
            },
            grid: {
              color: '#f1f5f9',
              lineWidth: 1
            }
          },
          y: { display: false }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
      if (axisInstanceRef.current) axisInstanceRef.current.destroy();
    };
  }, [tasks, viewMode, criticalPathIds, baseline]);

  return (
    <div className="flex-grow flex flex-col bg-white relative min-w-0 overflow-hidden">
      {/* Timeline header - matches grid header height */}
      <div className="flex-none overflow-hidden bg-white border-b-2 border-slate-200" style={{ height: '36px' }}>
        <div className="relative" style={{ height: '36px' }}>
          <canvas ref={axisCanvasRef} />
        </div>
      </div>
      {/* Chart body */}
      <div className="flex-grow overflow-auto custom-scrollbar" id="chart-scroll">
        <div ref={containerRef} className="relative">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
};

export default GanttChart;
