import React, { useState, useRef, useEffect, useMemo } from 'react';
import { getFinishDate, calculateCriticalPath } from '../utils/helpers';
import { ICONS } from '../utils/constants';

const ScheduleGrid = ({ 
  tasks, 
  onUpdateTask,
  onDeleteTask,
  onModifyHierarchy,
  onToggleTrack,
  onInsertTask
}) => {
  const [editingCell, setEditingCell] = useState(null);
  const [columnWidths, setColumnWidths] = useState({
    id: 40,
    name: 240,
    dep: 50,
    type: 70,
    dur: 55,
    start: 100,
    finish: 100,
    pct: 55,
    track: 50,
    actions: 90
  });
  const [resizing, setResizing] = useState(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const criticalPathIds = useMemo(() => calculateCriticalPath(tasks), [tasks]);

  const handleCellEdit = (taskId, field, value) => {
    let processedValue = value;
    
    if (field === 'dur' || field === 'pct') {
      processedValue = value === "" ? 0 : parseInt(value) || 0;
    } else if (field === 'parent') {
      processedValue = value === "" ? null : parseInt(value) || null;
    }

    if (field === 'type' && value === 'Milestone') {
      onUpdateTask(taskId, { [field]: processedValue, dur: 0 });
    } else {
      onUpdateTask(taskId, { [field]: processedValue });
    }
    
    setEditingCell(null);
  };

  const handleResizeStart = (e, column) => {
    e.preventDefault();
    setResizing(column);
    startX.current = e.clientX;
    startWidth.current = columnWidths[column];
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (resizing) {
        const diff = e.clientX - startX.current;
        const newWidth = Math.max(35, startWidth.current + diff);
        setColumnWidths(prev => ({
          ...prev,
          [resizing]: newWidth
        }));
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    if (resizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const EditableCell = ({ task, field, children, className = "" }) => {
    const isEditing = editingCell === `${task.id}-${field}`;
    
    const handleClick = () => {
      setEditingCell(`${task.id}-${field}`);
    };

    const handleBlur = (e) => {
      handleCellEdit(task.id, field, e.target.value);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    };

    if (isEditing) {
      let input;
      if (field === 'type') {
        input = (
          <select autoFocus defaultValue={task[field]} onBlur={handleBlur} className="editing-input">
            <option value="Task">Task</option>
            <option value="Milestone">Milestone</option>
          </select>
        );
      } else if (field === 'depType') {
        input = (
          <select autoFocus defaultValue={task[field]} onBlur={handleBlur} className="editing-input">
            <option value="FS">FS</option>
            <option value="SS">SS</option>
            <option value="FF">FF</option>
            <option value="SF">SF</option>
          </select>
        );
      } else {
        input = (
          <input
            autoFocus
            type={field === 'start' ? 'date' : field === 'dur' || field === 'pct' ? 'number' : 'text'}
            defaultValue={task[field] ?? ''}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="editing-input"
          />
        );
      }
      return <td className={className}>{input}</td>;
    }

    return (
      <td className={`${className} editable`} onClick={handleClick}>
        {children}
      </td>
    );
  };

  const ResizeHandle = ({ column }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, column)}
      style={{ 
        position: 'absolute',
        right: 0,
        top: 0,
        width: '4px',
        height: '100%',
        cursor: 'col-resize',
        background: resizing === column ? '#6366F1' : 'transparent',
        zIndex: 10
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = '#CBD5E1'}
      onMouseLeave={(e) => {
        if (resizing !== column) e.currentTarget.style.background = 'transparent';
      }}
    />
  );

  const ROW_HEIGHT = 36;

  const getProgressColor = (pct) => {
    if (pct === 100) return 'progress-complete';
    if (pct > 0) return 'progress-partial';
    return 'progress-none';
  };

  return (
    <div className="h-full overflow-auto custom-scrollbar" id="grid-scroll">
      <table className="grid-table">
        <colgroup>
          {Object.entries(columnWidths).map(([col, w]) => (
            <col key={col} style={{ width: `${w}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="text-center" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              ID <ResizeHandle column="id" />
            </th>
            <th style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              Task Name <ResizeHandle column="name" />
            </th>
            <th className="text-center" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              Dep <ResizeHandle column="dep" />
            </th>
            <th className="text-center" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              Type <ResizeHandle column="type" />
            </th>
            <th className="text-center" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              Dur <ResizeHandle column="dur" />
            </th>
            <th style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              Start Date <ResizeHandle column="start" />
            </th>
            <th style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              Finish <ResizeHandle column="finish" />
            </th>
            <th className="text-center" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              Progress <ResizeHandle column="pct" />
            </th>
            <th className="text-center" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              Track <ResizeHandle column="track" />
            </th>
            <th className="text-center" style={{ position: 'sticky', top: 0, zIndex: 5, borderRight: 'none' }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => {
            const finishDate = getFinishDate(task.start, task.dur);
            const isMilestone = task.type === 'Milestone';
            const isCritical = criticalPathIds.has(task.id);
            const isEven = index % 2 === 0;

            return (
              <tr 
                key={task.id} 
                className="group" 
                style={{ 
                  height: `${ROW_HEIGHT}px`,
                  background: isEven ? '#ffffff' : '#f8fafc'
                }}
              >
                <td className="text-center text-slate-400 font-mono text-[11px]">
                  {task.id}
                </td>
                
                <EditableCell task={task} field="name">
                  <div style={{ paddingLeft: `${(task.indent || 0) * 18}px` }} className="flex items-center gap-1.5">
                    {isMilestone ? (
                      <span className="text-amber-500 text-[11px]">◆</span>
                    ) : task.indent > 0 ? (
                      <span className="text-slate-300 text-[11px]">└</span>
                    ) : (
                      <span className="text-slate-300 text-[10px]">–</span>
                    )}
                    <span className="font-medium truncate text-[12.5px]">
                      {task.name}
                    </span>
                    {isCritical && (
                      <span className="text-[7px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-1 py-px rounded flex-shrink-0">
                        CP
                      </span>
                    )}
                  </div>
                </EditableCell>

                <EditableCell task={task} field="parent" className="text-center font-mono text-slate-400 text-[11px]">
                  {task.parent || '–'}
                </EditableCell>

                <EditableCell task={task} field="type" className="text-center">
                  {isMilestone ? (
                    <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">MS</span>
                  ) : (
                    <span className="text-[9px] font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">TASK</span>
                  )}
                </EditableCell>

                <EditableCell task={task} field="dur" className="text-center text-slate-500 text-[12px]">
                  {task.dur}d
                </EditableCell>

                <EditableCell task={task} field="start" className="text-slate-500 font-mono text-[11px]">
                  {task.start}
                </EditableCell>

                <td className="text-slate-400 font-mono text-[11px]">
                  {finishDate}
                </td>

                <EditableCell task={task} field="pct" className={`text-center font-semibold text-[12px] ${getProgressColor(task.pct)}`}>
                  {task.pct}%
                </EditableCell>

                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={task.tracked || false}
                    onChange={(e) => onToggleTrack(task.id, e.target.checked)}
                    className="accent-indigo-600 cursor-pointer w-3.5 h-3.5"
                  />
                </td>

                <td className="text-center">
                  <div className="flex justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onModifyHierarchy(task.id, -1)} className="p-0.5 text-slate-400 hover:text-indigo-600 text-[11px]" title="Outdent">←</button>
                    <button onClick={() => onModifyHierarchy(task.id, 1)} className="p-0.5 text-slate-400 hover:text-indigo-600 text-[11px]" title="Indent">→</button>
                    <button onClick={() => onInsertTask(task.id)} className="p-0.5 text-slate-400 hover:text-emerald-600 text-[11px]" title="Insert">+</button>
                    <button onClick={() => onDeleteTask(task.id)} className="p-0.5 text-slate-400 hover:text-rose-500 text-[11px]" title="Delete">×</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ScheduleGrid;
