import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { getProjectDateRange } from '../utils/helpers';

const GanttChart = ({ tasks, viewMode = 'week' }) => {
  const canvasRef = useRef(null);
  const axisCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const axisInstanceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !axisCanvasRef.current || tasks.length === 0) return;

    // Get date range
    const { minDate, maxDate } = getProjectDateRange(tasks);

    // Calculate pixels per day based on view mode
    const pxPerDay = viewMode === 'week' ? 36 : (viewMode === '2week' ? 18 : 9);
    const chartWidth = Math.max(
      containerRef.current?.parentElement?.clientWidth || 800,
      ((maxDate - minDate) / 86400000) * pxPerDay
    );

    // Set container dimensions
    if (containerRef.current) {
      containerRef.current.style.width = `${chartWidth}px`;
      containerRef.current.style.height = `${tasks.length * 40}px`;
    }

    // Separate tasks and milestones for different rendering
    const regularTasks = tasks.filter(t => t.type !== 'Milestone');
    const milestones = tasks.filter(t => t.type === 'Milestone');
    
    // Prepare regular task data (bars)
    const taskData = regularTasks.map(task => {
      const startTime = new Date(task.start).getTime();
      const duration = (task.dur || 0.5) * 86400000;
      const endTime = startTime + duration;

      return {
        x: [startTime, endTime],
        y: task.name,
        pct: task.pct,
        type: task.type
      };
    });

    // Prepare milestone data (points)
    const milestoneData = milestones.map(task => ({
      x: new Date(task.start).getTime(),
      y: task.name,
      pct: task.pct,
      type: task.type
    }));

    // Destroy existing charts
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }
    if (axisInstanceRef.current) {
      axisInstanceRef.current.destroy();
    }

    // Create datasets
    const datasets = [];
    
    // Regular tasks dataset
    if (taskData.length > 0) {
      datasets.push({
        type: 'bar',
        data: taskData,
        backgroundColor: (context) => {
          const raw = context.raw;
          if (raw?.pct === 100) return '#10B981';
          if (raw?.pct > 0) return '#6366F1';
          return '#E2E8F0';
        },
        borderRadius: 8,
        barPercentage: 0.55
      });
    }

    // Milestones dataset (as scatter points)
    if (milestoneData.length > 0) {
      datasets.push({
        type: 'scatter',
        data: milestoneData,
        backgroundColor: '#F59E0B',
        borderColor: '#D97706',
        borderWidth: 2,
        pointStyle: 'rectRot', // Diamond shape
        radius: 8,
        hoverRadius: 10
      });
    }

    // Create main Gantt chart
    chartInstanceRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: tasks.map(t => t.name),
        datasets: datasets
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const taskName = context.label;
                const task = tasks.find(t => t.name === taskName);
                if (!task) return '';
                
                if (task.type === 'Milestone') {
                  return [
                    `Milestone: ${task.name}`,
                    `Date: ${task.start}`,
                    `Progress: ${task.pct}%`
                  ];
                }
                
                return [
                  `Task: ${task.name}`,
                  `Start: ${task.start}`,
                  `Duration: ${task.dur} days`,
                  `Progress: ${task.pct}%`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            min: minDate.getTime(),
            max: maxDate.getTime(),
            time: {
              unit: viewMode === 'week' ? 'day' : (viewMode === '2week' ? 'week' : 'month'),
              displayFormats: {
                day: 'MMM d',
                week: 'MMM d',
                month: 'MMM yyyy'
              }
            },
            display: false
          },
          y: {
            display: false
          }
        }
      }
    });

    // Create axis chart (header timeline)
    axisInstanceRef.current = new Chart(axisCanvasRef.current, {
      type: 'bar',
      data: {
        labels: [''],
        datasets: []
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            type: 'time',
            min: minDate.getTime(),
            max: maxDate.getTime(),
            position: 'top',
            time: {
              unit: viewMode === 'week' ? 'day' : (viewMode === '2week' ? 'week' : 'month'),
              displayFormats: {
                day: 'MMM d',
                week: 'MMM d',
                month: 'MMM yyyy'
              }
            },
            ticks: {
              font: {
                size: 10,
                weight: '800'
              },
              color: '#94A3B8'
            },
            grid: {
              color: '#F8FAFC'
            }
          },
          y: {
            display: false
          }
        }
      }
    });

    // Cleanup
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
      if (axisInstanceRef.current) {
        axisInstanceRef.current.destroy();
      }
    };
  }, [tasks, viewMode]);

  return (
    <div className="flex-grow flex flex-col bg-white relative min-w-0 overflow-hidden">
      {/* Chart header (timeline axis) */}
      <div className="flex-none overflow-hidden bg-slate-50 border-b border-slate-200 h-[44px]">
        <div className="relative">
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
