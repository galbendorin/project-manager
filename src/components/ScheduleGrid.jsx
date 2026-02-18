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
    id: 50,
    name: 250,
    dep: 60,
    type: 80,
    dur: 60,
    start: 120,
    finish: 120,
    pct: 60,
    track: 80,
    actions: 150
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
        const newWidth = Math.max(40, startWidth.current + diff);
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
          <select
            autoFocus
            defaultValue={task[field]}
            onBlur={handleBlur}
            className="editing-input"
          >
            <option value="Task">Task</option>
            <option value="Milestone">Milestone</option>
          </select>
        );
      } else if (field === 'depType') {
        input = (
          <select
            autoFocus
            defaultValue={task[field]}
            onBlur={handleBlur}
            className="editing-input"
          >
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
      return <td className={className} style={{ width: `${columnWidths[field]}px` }}>{input}</td>;
    }

    return (
      <td className={`${className} editable`} onClick={handleClick} style={{ width: `${columnWidths[field]}px` }}>
        {children}
      </td>
    );
  };

  const ResizeHandle = ({ column }) => (
    <div
      className="resizer"
      onMouseDown={(e) => handleResizeStart(e, column)}
      style={{ 
        position: 'absolute',
        right: 0,
        top: 0,
        width: '5px',
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

  return (
    <div className="flex-grow overflow-auto custom-scrollbar" id="grid-scroll">
      <table className="w-full" style={{ tableLayout: 'fixed' }}>
        <thead className="gantt-header">
          <tr>
            <th style={{ width: `${columnWidths.id}px`, position: 'relative' }} className="text-center">
              ID
              <ResizeHandle column="id" />
            </th>
            <th style={{ width: `${columnWidths.name}px`, position: 'relative' }}>
              Name
              <ResizeHandle column="name" />
            </th>
            <th style={{ width: `${columnWidths.dep}px`, position: 'relative' }} className="text-center">
              Dep
              <ResizeHandle column="dep" />
            </th>
            <th style={{ width: `${columnWidths.type}px`, position: 'relative' }} className="text-center">
              Typ
              <ResizeHandle column="type" />
            </th>
            <th style={{ width: `${columnWidths.dur}px`, position: 'relative' }} className="text-center">
              Dur
              <ResizeHandle column="dur" />
            </th>
            <th style={{ width: `${columnWidths.start}px`, position: 'relative' }}>
              Start
              <ResizeHandle column="start" />
            </th>
            <th style={{ width: `${columnWidths.finish}px`, position: 'relative' }} className="text-slate-400">
              Finish
              <ResizeHandle column="finish" />
            </th>
            <th style={{ width: `${columnWidths.pct}px`, position: 'relative' }} className="text-center">
              %
              <ResizeHandle column="pct" />
            </th>
            <th style={{ width: `${columnWidths.track}px`, position: 'relative' }} className="text-center">
              Track
              <ResizeHandle column="track" />
            </th>
            <th style={{ width: `${columnWidths.actions}px`, position: 'relative' }} className="text-center">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => {
            const finishDate = getFinishDate(task.start, task.dur);
            const isMilestone = task.type === 'Milestone';
            const isCritical = criticalPathIds.has(task.id);

            return (
              <tr 
                key={task.id} 
                className="gantt-row group hover:bg-slate-50 transition-colors"
              >
                <td 
                  style={{ width: `${columnWidths.id}px` }} 
                  className="text-center font-mono font-bold text-slate-300 border-r border-slate-100 text-[10px]"
                >
                  {task.id}
                </td>
                
                <EditableCell task={task} field="name" className="border-r border-slate-100">
                  <div style={{ paddingLeft: `${(task.indent || 0) * 16}px` }} className="flex items-center gap-2">
                    <span className={`text-[12px] ${
                      isMilestone ? 'text-amber-500' : 'text-slate-300'
                    }`}>
                      {isMilestone ? '⭐' : (task.indent > 0 ? '└' : '—')}
                    </span>
                    <span className="font-bold tracking-tight truncate">
                      {task.name}
                    </span>
                    {isCritical && (
                      <span className="text-[8px] font-black text-purple-600 bg-purple-100 px-1 rounded flex-shrink-0">
                        CP
                      </span>
                    )}
                  </div>
                </EditableCell>

                <EditableCell task={task} field="parent" className="text-center font-mono text-slate-400 border-r border-slate-100">
                  {task.parent || '-'}
                </EditableCell>

                <EditableCell task={task} field="type" className="text-center text-[9px] uppercase font-black text-slate-400 border-r border-slate-100">
                  {task.type}
                </EditableCell>

                <EditableCell task={task} field="dur" className="text-center font-bold text-slate-500 border-r border-slate-100">
                  {task.dur}d
                </EditableCell>

                <EditableCell task={task} field="start" className="text-slate-500 font-mono text-[10px] border-r border-slate-100">
                  {task.start}
                </EditableCell>

                <td style={{ width: `${columnWidths.finish}px` }} className="text-slate-400 font-mono text-[10px] border-r border-slate-100 bg-slate-50/30">
                  {finishDate}
                </td>

                <EditableCell task={task} field="pct" className="text-center font-bold text-indigo-600 border-r border-slate-100">
                  {task.pct}%
                </EditableCell>

                <td style={{ width: `${columnWidths.track}px` }} className="text-center border-r border-slate-100">
                  <input
                    type="checkbox"
                    checked={task.tracked || false}
                    onChange={(e) => onToggleTrack(task.id, e.target.checked)}
                    className="accent-indigo-600 cursor-pointer w-3.5 h-3.5"
                  />
                </td>

                <td style={{ width: `${columnWidths.actions}px` }} className="text-center">
                  <div className="flex justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onModifyHierarchy(task.id, -1)}
                      className="p-1 hover:text-indigo-600"
                      title="Outdent"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => onModifyHierarchy(task.id, 1)}
                      className="p-1 hover:text-indigo-600"
                      title="Indent"
                    >
                      →
                    </button>
                    <button
                      onClick={() => onInsertTask(task.id)}
                      className="p-1 hover:text-emerald-600"
                      title="Insert Below"
                    >
                      <div dangerouslySetInnerHTML={{ __html: ICONS.plus }} />
                    </button>
                    <button
                      onClick={() => onDeleteTask(task.id)}
                      className="p-1 hover:text-rose-500"
                    >
                      <div dangerouslySetInnerHTML={{ __html: ICONS.trash }} />
                    </button>
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
