import { useEffect, useRef, useState } from 'react';
import { Chart, BarController, CategoryScale, LinearScale, TimeScale, Tooltip } from 'chart.js';
import 'chartjs-adapter-date-fns';

Chart.register(BarController, CategoryScale, LinearScale, TimeScale, Tooltip);

const HEADER_HEIGHT = 50; // Increased from 34 to 50 for better date visibility
const ROW_HEIGHT = 34;

export default function GanttChart({
  tasks,
  viewMode,
  baseline,
  collapsedIndices,
  scrollTop,
  onBarClick
}) {
  const axisCanvasRef = useRef(null);
  const bodyCanvasRef = useRef(null);
  const axisChartRef = useRef(null);
  const bodyChartRef = useRef(null);
  const containerRef = useRef(null);

  const [isInitialized, setIsInitialized] = useState(false);

  // Calculate date range
  const getDateRange = () => {
    const visibleTasks = tasks.filter((_, i) => !collapsedIndices.has(i));
    if (visibleTasks.length === 0) {
      const now = new Date();
      return { min: now, max: new Date(now.getTime() + 30 * 86400000) };
    }

    let minDate = new Date(visibleTasks[0].start);
    let maxDate = new Date(visibleTasks[0].finish);

    visibleTasks.forEach(t => {
      const s = new Date(t.start);
      const f = new Date(t.finish);
      if (s < minDate) minDate = s;
      if (f > maxDate) maxDate = f;
    });

    const pad = viewMode === '1 Week' ? 7 : viewMode === '2 Week' ? 14 : 30;
    return {
      min: new Date(minDate.getTime() - pad * 86400000),
      max: new Date(maxDate.getTime() + pad * 86400000)
    };
  };

  const { min, max } = getDateRange();

  // Time unit based on view mode
  const getTimeUnit = () => {
    if (viewMode === '1 Week') return 'day';
    if (viewMode === '2 Week') return 'day';
    return 'week';
  };

  const timeUnit = getTimeUnit();

  // Row stripes plugin
  const rowStripesPlugin = {
    id: 'rowStripes',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.y) return;

      const yScale = scales.y;
      const visibleTasks = tasks.filter((_, i) => !collapsedIndices.has(i));

      ctx.save();
      visibleTasks.forEach((task, index) => {
        if (index % 2 === 0) {
          const yTop = yScale.getPixelForValue(index) - ROW_HEIGHT / 2;
          ctx.fillStyle = 'rgba(248, 250, 252, 0.5)';
          ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, ROW_HEIGHT);
        }
      });
      ctx.restore();
    }
  };

  // Today line plugin for body
  const todayLinePlugin = {
    id: 'todayLine',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) return;

      const xScale = scales.x;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const x = xScale.getPixelForValue(now.getTime());

      if (x >= chartArea.left && x <= chartArea.right) {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Today line plugin for axis
  const todayLineAxisPlugin = {
    id: 'todayLineAxis',
    beforeDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) return;

      const xScale = scales.x;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const x = xScale.getPixelForValue(now.getTime());

      if (x >= chartArea.left && x <= chartArea.right) {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Weekend shading plugin
  const weekendShadingPlugin = {
    id: 'weekendShading',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) return;

      const xScale = scales.x;
      ctx.save();

      let current = new Date(min);
      while (current <= max) {
        const day = current.getDay();
        if (day === 0 || day === 6) {
          const x1 = xScale.getPixelForValue(current.getTime());
          const nextDay = new Date(current);
          nextDay.setDate(nextDay.getDate() + 1);
          const x2 = xScale.getPixelForValue(nextDay.getTime());

          if (x2 >= chartArea.left && x1 <= chartArea.right) {
            ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
            ctx.fillRect(
              Math.max(x1, chartArea.left),
              chartArea.top,
              Math.min(x2, chartArea.right) - Math.max(x1, chartArea.left),
              chartArea.bottom - chartArea.top
            );
          }
        }
        current.setDate(current.getDate() + 1);
      }
      ctx.restore();
    }
  };

  // Gantt overlay plugin (bars, baselines, dependencies)
  const ganttOverlayPlugin = {
    id: 'ganttOverlay',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x || !scales.y) return;

      const xScale = scales.x;
      const yScale = scales.y;
      const visibleTasks = tasks.filter((_, i) => !collapsedIndices.has(i));

      ctx.save();

      // Draw Gantt bars
      visibleTasks.forEach((task, index) => {
        const yCenter = yScale.getPixelForValue(index);
        const startX = xScale.getPixelForValue(new Date(task.start).getTime());

        if (task._isParent) {
          // Parent summary bar (bracket)
          const endX = xScale.getPixelForValue(new Date(task.finish).getTime());
          const barHeight = 8;
          const yTop = yCenter - barHeight / 2;

          ctx.fillStyle = '#6366f1';
          ctx.fillRect(startX, yTop, 3, barHeight);
          ctx.fillRect(endX - 3, yTop, 3, barHeight);
          ctx.fillRect(startX, yTop, endX - startX, 2);
          ctx.fillRect(startX, yTop + barHeight - 2, endX - startX, 2);
        } else if (task.type === 'Milestone') {
          // Diamond
          const size = 10;
          ctx.fillStyle = task._isCritical ? '#a855f7' : '#6366f1';
          ctx.beginPath();
          ctx.moveTo(startX, yCenter - size);
          ctx.lineTo(startX + size, yCenter);
          ctx.lineTo(startX, yCenter + size);
          ctx.lineTo(startX - size, yCenter);
          ctx.closePath();
          ctx.fill();
        } else {
          // Regular task bar
          const barWidth = (task._calendarDays || 1) * (xScale.getPixelForValue(new Date(min).getTime() + 86400000) - xScale.getPixelForValue(new Date(min).getTime()));
          const barHeight = 20;
          const yTop = yCenter - barHeight / 2;

          const progress = parseFloat(task.progress) || 0;
          const color = task._isCritical ? '#a855f7' : '#6366f1';

          // Background
          ctx.fillStyle = color + '30';
          ctx.fillRect(startX, yTop, barWidth, barHeight);

          // Progress fill
          if (progress > 0) {
            ctx.fillStyle = color;
            ctx.fillRect(startX, yTop, barWidth * (progress / 100), barHeight);
          }

          // Border
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.strokeRect(startX, yTop, barWidth, barHeight);
        }

        // Baseline ghost bar
        if (baseline && baseline[task.id]) {
          const baseStart = new Date(baseline[task.id].start).getTime();
          const baseFinish = new Date(baseline[task.id].finish).getTime();
          const baseStartX = xScale.getPixelForValue(baseStart);
          const baseEndX = xScale.getPixelForValue(baseFinish);
          const barHeight = 4;
          const yTop = yCenter + 14;

          ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
          ctx.fillRect(baseStartX, yTop, baseEndX - baseStartX, barHeight);
        }
      });

      // Draw dependencies
      visibleTasks.forEach((task, index) => {
        if (!task.dep) return;
        const depIndex = visibleTasks.findIndex(t => t.id === task.dep);
        if (depIndex === -1) return;

        const depTask = visibleTasks[depIndex];
        const fromX = xScale.getPixelForValue(new Date(depTask.finish).getTime());
        const fromY = yScale.getPixelForValue(depIndex);
        const toX = xScale.getPixelForValue(new Date(task.start).getTime());
        const toY = yScale.getPixelForValue(index);

        const isCritical = task._isCritical && depTask._isCritical;
        ctx.strokeStyle = isCritical ? '#a855f7' : '#94a3b8';
        ctx.lineWidth = isCritical ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        const midX = (fromX + toX) / 2;
        ctx.lineTo(midX, fromY);
        ctx.lineTo(midX, toY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Arrow
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - 6, toY - 4);
        ctx.lineTo(toX - 6, toY + 4);
        ctx.closePath();
        ctx.fill();
      });

      ctx.restore();
    }
  };

  useEffect(() => {
    const axisCanvas = axisCanvasRef.current;
    const bodyCanvas = bodyCanvasRef.current;
    if (!axisCanvas || !bodyCanvas) return;

    const axisCtx = axisCanvas.getContext('2d');
    const bodyCtx = bodyCanvas.getContext('2d');

    const visibleTasks = tasks.filter((_, i) => !collapsedIndices.has(i));

    const commonXScale = {
      type: 'time',
      position: 'top',
      min: min.getTime(),
      max: max.getTime(),
      time: {
        unit: timeUnit,
        displayFormats: {
          day: 'MMM d',
          week: 'MMM d'
        },
        tooltipFormat: 'MMM d, yyyy'
      },
      grid: {
        display: true,
        drawOnChartArea: true,
        color: '#e2e8f0'
      },
      ticks: {
        maxRotation: 0,
        minRotation: 0,
        autoSkip: true,
        font: {
          size: 12,
          weight: '500'
        },
        color: '#475569',
        padding: 8
      }
    };

    // Axis chart (header)
    if (axisChartRef.current) {
      axisChartRef.current.destroy();
    }

    axisChartRef.current = new Chart(axisCtx, {
      type: 'bar',
      data: {
        labels: [''],
        datasets: [{
          data: [0],
          backgroundColor: 'transparent'
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        layout: { padding: 0 },
        scales: {
          x: commonXScale,
          y: {
            display: false,
            min: 0,
            max: 1
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      },
      plugins: [todayLineAxisPlugin]
    });

    // Body chart
    if (bodyChartRef.current) {
      bodyChartRef.current.destroy();
    }

    bodyChartRef.current = new Chart(bodyCtx, {
      type: 'bar',
      data: {
        labels: visibleTasks.map((_, i) => i.toString()),
        datasets: [{
          data: visibleTasks.map(() => 0),
          backgroundColor: 'transparent'
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        layout: { padding: 0 },
        onClick: (event, elements, chart) => {
          if (elements.length > 0 && onBarClick) {
            const index = elements[0].index;
            const originalIndex = tasks.indexOf(visibleTasks[index]);
            onBarClick(originalIndex);
          }
        },
        scales: {
          x: {
            ...commonXScale,
            display: false
          },
          y: {
            type: 'category',
            display: false,
            min: -0.5,
            max: visibleTasks.length - 0.5
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      },
      plugins: [rowStripesPlugin, todayLinePlugin, weekendShadingPlugin, ganttOverlayPlugin]
    });

    setIsInitialized(true);

    return () => {
      if (axisChartRef.current) axisChartRef.current.destroy();
      if (bodyChartRef.current) bodyChartRef.current.destroy();
    };
  }, [tasks, viewMode, baseline, collapsedIndices, min, max, timeUnit, onBarClick]);

  // Sync scroll
  useEffect(() => {
    if (!isInitialized || !containerRef.current) return;
    containerRef.current.scrollTop = scrollTop;
  }, [scrollTop, isInitialized]);

  const visibleTasks = tasks.filter((_, i) => !collapsedIndices.has(i));
  const totalHeight = visibleTasks.length * ROW_HEIGHT;

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      {/* Fixed header canvas */}
      <div style={{ height: `${HEADER_HEIGHT}px`, flexShrink: 0 }}>
        <canvas
          ref={axisCanvasRef}
          width={800}
          height={HEADER_HEIGHT}
          style={{ display: 'block' }}
        />
      </div>

      {/* Scrollable body canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-scroll overflow-x-hidden"
        style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}
      >
        <canvas
          ref={bodyCanvasRef}
          width={800}
          height={totalHeight}
          style={{ display: 'block' }}
        />
      </div>
    </div>
  );
}
