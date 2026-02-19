import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { getFinishDate, calculateCriticalPath, getHierarchyMap } from '../utils/helpers';

const GRID_HEADER_HEIGHT = 34;

const ScheduleGrid = ({ 
  allTasks,
  visibleTasks,
  collapsedIndices,
  onToggleCollapse,
  onUpdateTask,
  onDeleteTask,
  onModifyHierarchy,
  onToggleTrack,
  onInsertTask,
  onReorderTask,
  onSendToTracker,
  isInTracker
}) => {
  const [editingCell, setEditingCell] = useState(null);
  const [columnWidths, setColumnWidths] = useState({
    drag: 28, id: 40, name: 220, dep: 50, type: 70,
    dur: 55, start: 100, finish: 100, pct: 55, track: 50, actions: 110
  });
  const [resizing, setResizing] = useState(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const criticalPathIds = useMemo(() => calculateCriticalPath(allTasks), [allTasks]);
  const { isParent, directChildCount } = useMemo(() => getHierarchyMap(allTasks), [allTasks]);

  const handleCellEdit = (taskId, field, value) => {
    let processedValue = value;
    if (field === 'dur' || field === 'pct') processedValue = value === "" ? 0 : parseInt(value) || 0;
    else if (field === 'parent') processedValue = value === "" ? null : parseInt(value) || null;
    if (field === 'type' && value === 'Milestone') onUpdateTask(taskId, { [field]: processedValue, dur: 0 });
    else onUpdateTask(taskId, { [field]: processedValue });
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
        setColumnWidths(prev => ({ ...prev, [resizing]: Math.max(35, startWidth.current + diff) }));
      }
    };
    const handleMouseUp = () => setResizing(null);
    if (resizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [resizing]);

  const handleDragStart = useCallback((e, origIdx) => {
    setDragIndex(origIdx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', origIdx.toString());
    if (e.currentTarget) e.currentTarget.style.opacity = '0.4';
  }, []);
  const handleDragEnd = useCallback((e) => {
    if (e.currentTarget) e.currentTarget.style.opacity = '1';
    setDragIndex(null); setDragOverIndex(null);
  }, []);
  const handleDragOver = useCallback((e, origIdx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (origIdx !== dragOverIndex) setDragOverIndex(origIdx);
  }, [dragOverIndex]);
  const handleDrop = useCallback((e, dropOrigIdx) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== dropOrigIdx) onReorderTask(dragIndex, dropOrigIdx);
    setDragIndex(null); setDragOverIndex(null);
  }, [dragIndex, onReorderTask]);

  const EditableCell = ({ task, field, children, className = "", disabled = false }) => {
    const isEditing = editingCell === `${task.id}-${field}` && !disabled;
    const handleClick = () => { if (!disabled) setEditingCell(`${task.id}-${field}`); };
    const handleBlur = (e) => handleCellEdit(task.id, field, e.target.value);
    const handleKeyDown = (e) => { if (e.key === 'Enter') e.target.blur(); };

    if (isEditing) {
      let input;
      if (field === 'type') {
        input = (<select autoFocus defaultValue={task[field]} onBlur={handleBlur} className="editing-input"><option value="Task">Task</option><option value="Milestone">Milestone</option></select>);
      } else if (field === 'depType') {
        input = (<select autoFocus defaultValue={task[field]} onBlur={handleBlur} className="editing-input"><option value="FS">FS</option><option value="SS">SS</option><option value="FF">FF</option><option value="SF">SF</option></select>);
      } else {
        input = (<input autoFocus type={field === 'start' ? 'date' : field === 'dur' || field === 'pct' ? 'number' : 'text'} defaultValue={task[field] ?? ''} onBlur={handleBlur} onKeyDown={handleKeyDown} className="editing-input" min={field === 'dur' ? '0' : undefined} />);
      }
      return <td className={className}>{input}</td>;
    }
    return <td className={`${className} ${disabled ? '' : 'editable'}`} onClick={handleClick}>{children}</td>;
  };

  const ResizeHandle = ({ column }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, column)}
      style={{ position: 'absolute', right: 0, top: 0, width: '4px', height: '100%', cursor: 'col-resize', background: resizing === column ? '#6366F1' : 'transparent', zIndex: 10 }}
      onMouseEnter={(e) => e.currentTarget.style.background = '#CBD5E1'}
      onMouseLeave={(e) => { if (resizing !== column) e.currentTarget.style.background = 'transparent'; }}
    />
  );

  const ROW_HEIGHT = 36;
  const getProgressColor = (pct) => pct === 100 ? 'progress-complete' : pct > 0 ? 'progress-partial' : 'progress-none';

  const colGroupCols = (
    <colgroup>
      <col style={{ width: `${columnWidths.drag}px` }} />
      {Object.entries(columnWidths).filter(([k]) => k !== 'drag').map(([col, w]) => (
        <col key={col} style={{ width: `${w}px` }} />
      ))}
    </colgroup>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Fixed header */}
      <div className="flex-none overflow-hidden" style={{ height: `${GRID_HEADER_HEIGHT}px` }}>
        <table className="grid-table">
          {colGroupCols}
          <thead>
            <tr>
              <th style={{ textAlign: 'center', padding: '8px 2px' }}>⠿</th>
              <th className="text-center">ID <ResizeHandle column="id" /></th>
              <th>Task Name <ResizeHandle column="name" /></th>
              <th className="text-center">Dep <ResizeHandle column="dep" /></th>
              <th className="text-center">Type <ResizeHandle column="type" /></th>
              <th className="text-center">Dur <ResizeHandle column="dur" /></th>
              <th>Start Date <ResizeHandle column="start" /></th>
              <th>Finish <ResizeHandle column="finish" /></th>
              <th className="text-center">Progress <ResizeHandle column="pct" /></th>
              <th className="text-center">Track <ResizeHandle column="track" /></th>
              <th className="text-center" style={{ borderRight: 'none' }}>Actions</th>
            </tr>
          </thead>
        </table>
      </div>
      {/* Scrollable body */}
      <div className="flex-grow overflow-auto custom-scrollbar" id="grid-scroll">
        <table className="grid-table">
          {colGroupCols}
          <tbody>
            {visibleTasks.map((task, rowIdx) => {
              const origIdx = task._originalIndex;
              const isParentRow = task._isParent;
              const isCollapsed = collapsedIndices.has(origIdx);
              const isMilestone = task.type === 'Milestone';
              const isCritical = criticalPathIds.has(task.id);
              const finishDate = getFinishDate(task.start, task.dur);
              const isEven = rowIdx % 2 === 0;
              const isDragging = dragIndex === origIdx;
              const isOver = dragOverIndex === origIdx;
              const tracked = isInTracker ? isInTracker(task.id) : false;

              const childCount = isParentRow && isCollapsed && directChildCount.has(origIdx)
                ? directChildCount.get(origIdx) : 0;

              return (
                <tr
                  key={task.id}
                  className="group"
                  draggable
                  onDragStart={(e) => handleDragStart(e, origIdx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, origIdx)}
                  onDrop={(e) => handleDrop(e, origIdx)}
                  style={{
                    height: `${ROW_HEIGHT}px`,
                    background: isDragging ? '#EEF2FF' : isParentRow ? '#f1f5f9' : isEven ? '#ffffff' : '#fafbfc',
                    borderTop: isOver && dragIndex !== null && dragIndex > origIdx ? '2px solid #6366f1' : undefined,
                    borderBottom: isOver && dragIndex !== null && dragIndex < origIdx ? '2px solid #6366f1' : undefined,
                    opacity: isDragging ? 0.5 : 1
                  }}
                >
                  <td style={{ textAlign: 'center', cursor: 'grab', padding: '0 2px', userSelect: 'none' }} className="text-slate-300 hover:text-slate-500 text-[11px]" title="Drag to reorder">⠿</td>

                  <td className="text-center text-slate-400 font-mono text-[11px]">{task.id}</td>

                  <EditableCell task={task} field="name">
                    <div style={{ paddingLeft: `${(task.indent || 0) * 18}px` }} className="flex items-center gap-1">
                      {isParentRow ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleCollapse(origIdx); }}
                          className="text-slate-400 hover:text-indigo-600 w-4 h-4 flex items-center justify-center flex-shrink-0"
                          style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
                          title={isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          <span className="text-[11px]">▾</span>
                        </button>
                      ) : (
                        <span className="w-4 flex-shrink-0 text-center">
                          {isMilestone ? <span className="text-amber-500 text-[11px]">◆</span>
                            : task.indent > 0 ? <span className="text-slate-300 text-[11px]">└</span>
                            : <span className="text-slate-300 text-[10px]">–</span>}
                        </span>
                      )}
                      <span className={`truncate text-[12.5px] ${isParentRow ? 'font-semibold text-slate-800' : 'font-medium'}`}>
                        {task.name}
                      </span>
                      {isParentRow && isCollapsed && childCount > 0 && (
                        <span className="text-[8px] text-slate-400 bg-slate-200 px-1 py-px rounded flex-shrink-0">
                          +{childCount}
                        </span>
                      )}
                      {isCritical && (
                        <span className="text-[7px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-1 py-px rounded flex-shrink-0">CP</span>
                      )}
                    </div>
                  </EditableCell>

                  <EditableCell task={task} field="parent" className="text-center font-mono text-slate-400 text-[11px]" disabled={isParentRow}>
                    {task.parent || '–'}
                  </EditableCell>

                  <EditableCell task={task} field="type" className="text-center">
                    {isMilestone ? <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">MS</span>
                      : isParentRow ? <span className="text-[9px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">GROUP</span>
                      : <span className="text-[9px] font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">TASK</span>}
                  </EditableCell>

                  <EditableCell task={task} field="dur" className={`text-center text-[12px] ${isParentRow ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`} disabled={isParentRow || isMilestone}>
                    {task.dur}d
                  </EditableCell>

                  <EditableCell task={task} field="start" className={`font-mono text-[11px] ${isParentRow ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`} disabled={isParentRow}>
                    {task.start}
                  </EditableCell>

                  <td className={`font-mono text-[11px] ${isParentRow ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>
                    {finishDate}
                  </td>

                  <EditableCell task={task} field="pct" className={`text-center font-semibold text-[12px] ${getProgressColor(task.pct)}`} disabled={isParentRow}>
                    {task.pct}%
                  </EditableCell>

                  <td className="text-center">
                    <input type="checkbox" checked={task.tracked || false} onChange={(e) => onToggleTrack(task.id, e.target.checked)} className="accent-indigo-600 cursor-pointer w-3.5 h-3.5" />
                  </td>

                  <td className="text-center">
                    <div className="flex justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onModifyHierarchy(task.id, -1)} className="p-0.5 text-slate-400 hover:text-indigo-600 text-[11px]" title="Outdent">←</button>
                      <button onClick={() => onModifyHierarchy(task.id, 1)} className="p-0.5 text-slate-400 hover:text-indigo-600 text-[11px]" title="Indent">→</button>
                      <button onClick={() => onInsertTask(task.id)} className="p-0.5 text-slate-400 hover:text-emerald-600 text-[11px]" title="Insert">+</button>
                      {onSendToTracker && (
                        tracked ? (
                          <span className="p-0.5 text-indigo-500 text-[11px]" title="In tracker">◆</span>
                        ) : (
                          <button onClick={() => onSendToTracker(task.id)} className="p-0.5 text-slate-400 hover:text-indigo-600 text-[11px]" title="Send to Tracker">▸</button>
                        )
                      )}
                      <button onClick={() => onDeleteTask(task.id)} className="p-0.5 text-slate-400 hover:text-rose-500 text-[11px]" title="Delete">×</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScheduleGrid;
