import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { getFinishDate, calculateCriticalPath, getHierarchyMap, formatDependencies, hasDependencies } from '../utils/helpers';

const GRID_HEADER_HEIGHT = 55;
const ROW_HEIGHT = 36;
const VIRTUALIZATION_THRESHOLD = 120;
const OVERSCAN_ROWS = 20;
const TOTAL_COLS = 12;

// ── Pure functions (module-level, never recreated) ───────────────────

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDate().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear().toString().slice(-2);
  return `${day}-${month}-${year}`;
};

const getProgressColor = (pct) => pct === 100 ? 'progress-complete' : pct > 0 ? 'progress-partial' : 'progress-none';

// ── Memoized EditableCell ────────────────────────────────────────────

const EditableCell = React.memo(({
  task, field, children, className = "", disabled = false,
  editingCell, setEditingCell, onCellEdit
}) => {
  const cellKey = `${task.id}-${field}`;
  const isEditing = editingCell === cellKey && !disabled;
  const handleClick = () => { if (!disabled) setEditingCell(cellKey); };
  const handleBlur = (e) => onCellEdit(task.id, field, e.target.value);
  const handleKeyDown = (e) => { if (e.key === 'Enter') e.target.blur(); };

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
          min={field === 'dur' ? '0' : undefined}
        />
      );
    }
    return <td className={className}>{input}</td>;
  }
  return <td className={`${className} ${disabled ? '' : 'editable'}`} onClick={handleClick}>{children}</td>;
});

EditableCell.displayName = 'EditableCell';

// ── Memoized TaskRow ─────────────────────────────────────────────────

const TaskRow = React.memo(({
  task, absoluteRowIdx, isCollapsed, isCritical, childCount,
  isDragging, isOver, dragIndex, todayMidnightTs,
  editingCell, colorPickerOpen,
  // Handlers
  onToggleCollapse, onUpdateTask, onDeleteTask, onModifyHierarchy,
  onToggleTrack, onInsertTask, onSendToTracker, onSendToActionLog,
  onRemoveFromActionLog, onRemoveFromTracker, isInTracker,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onCellEdit, setEditingCell, setColorPickerOpen, onOpenDepsEditor
}) => {
  const origIdx = task._originalIndex;
  const isParentRow = task._isParent;
  const isMilestone = task.type === 'Milestone';
  const finishDate = getFinishDate(task.start, task.dur);
  const isEven = absoluteRowIdx % 2 === 0;

  const getRowColor = () => {
    if (task.rowColor) {
      const colorMap = { red: '#fee2e2', amber: '#fef3c7', brown: '#d6c5b0' };
      return colorMap[task.rowColor] || null;
    }
    if (isDragging) return '#EEF2FF';
    if (isParentRow) return '#f1f5f9';
    const taskFinish = new Date(finishDate);
    taskFinish.setHours(0, 0, 0, 0);
    const isPastDeadline = taskFinish.getTime() < todayMidnightTs && task.pct < 100;
    if (isPastDeadline) return '#fee2e2';
    if (task.pct === 100) return '#d1fae5';
    if (task.pct > 0 && task.pct < 100) return '#ecfdf5';
    return isEven ? '#ffffff' : '#fafbfc';
  };

  const ecProps = { editingCell, setEditingCell, onCellEdit };

  return (
    <tr
      key={task.id}
      className="group"
      draggable
      onDragStart={(e) => onDragStart(e, origIdx)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, origIdx)}
      onDrop={(e) => onDrop(e, origIdx)}
      style={{
        height: `${ROW_HEIGHT}px`,
        background: getRowColor(),
        borderTop: isOver && dragIndex !== null && dragIndex > origIdx ? '2px solid #6366f1' : undefined,
        borderBottom: isOver && dragIndex !== null && dragIndex < origIdx ? '2px solid #6366f1' : undefined,
        opacity: isDragging ? 0.5 : 1
      }}
    >
      <td style={{ textAlign: 'center', cursor: 'grab', padding: '0 2px', userSelect: 'none' }} className="text-slate-300 hover:text-slate-500 text-[11px]" title="Drag to reorder">⠿</td>

      <td className="text-center text-slate-400 font-mono text-[11px]">{task.id}</td>

      <EditableCell task={task} field="name" {...ecProps}>
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

      <td
        className="text-center text-[10px] text-slate-600 cursor-pointer hover:bg-indigo-50 px-2"
        onClick={() => !isParentRow && onOpenDepsEditor(task)}
        title="Click to edit dependencies"
        colSpan={2}
      >
        {formatDependencies(task)}
      </td>

      <EditableCell task={task} field="type" className="text-center" {...ecProps}>
        {isMilestone ? <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">MS</span>
          : isParentRow ? <span className="text-[9px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">GROUP</span>
          : <span className="text-[9px] font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">TASK</span>}
      </EditableCell>

      <EditableCell task={task} field="dur" className={`text-center text-[12px] ${isParentRow ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`} disabled={isParentRow || isMilestone} {...ecProps}>
        {task.dur}d
      </EditableCell>

      <EditableCell task={task} field="start" className={`font-mono text-[11px] ${isParentRow ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`} disabled={isParentRow || hasDependencies(task)} {...ecProps}>
        {formatDateDisplay(task.start)}
      </EditableCell>

      <td className={`font-mono text-[11px] ${isParentRow ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>
        {formatDateDisplay(finishDate)}
      </td>

      <EditableCell task={task} field="pct" className={`text-center font-semibold text-[12px] ${getProgressColor(task.pct)}`} disabled={isParentRow} {...ecProps}>
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
            isInTracker && isInTracker(task.id) ? (
              <button
                onClick={() => onRemoveFromTracker && onRemoveFromTracker(task.id)}
                className="px-1.5 py-0.5 text-[9px] font-semibold border rounded text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                title="Remove from Master Tracker"
              >
                MT✓
              </button>
            ) : (
              <button
                onClick={() => onSendToTracker(task.id)}
                className="px-1.5 py-0.5 text-[9px] font-semibold border rounded text-slate-500 border-slate-200 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50"
                title="Send to Master Tracker"
              >
                MT+
              </button>
            )
          )}
          {task.tracked ? (
            <button
              onClick={() => onRemoveFromActionLog && onRemoveFromActionLog(task.id)}
              className="px-1.5 py-0.5 text-[9px] font-semibold border rounded text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
              title="Remove from Action Log"
            >
              AL✓
            </button>
          ) : (
            <button
              onClick={() => onSendToActionLog && onSendToActionLog(task.id)}
              className="px-1.5 py-0.5 text-[9px] font-semibold border rounded text-slate-500 border-slate-200 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50"
              title="Send to Action Log"
            >
              AL+
            </button>
          )}
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setColorPickerOpen(colorPickerOpen === task.id ? null : task.id);
              }}
              className="p-0.5 text-slate-400 hover:text-indigo-600 text-[11px]"
              title="Set row color"
            >
              🎨
            </button>
          </>
          {colorPickerOpen === task.id && (
            <div
              className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-[9999]"
              onClick={() => setColorPickerOpen(null)}
            >
              <div
                className="bg-white border border-slate-300 rounded-lg shadow-2xl p-3"
                onClick={(e) => e.stopPropagation()}
                style={{ minWidth: '160px' }}
              >
                <div className="text-sm font-semibold text-slate-700 mb-2 pb-2 border-b">Choose Row Color</div>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateTask(task.id, { rowColor: null }); setColorPickerOpen(null); }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-100 rounded mb-1"
                >
                  ⚪ Default
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateTask(task.id, { rowColor: 'red' }); setColorPickerOpen(null); }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-red-100 rounded mb-1"
                  style={{ backgroundColor: task.rowColor === 'red' ? '#fee2e2' : undefined }}
                >
                  🔴 Red
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateTask(task.id, { rowColor: 'amber' }); setColorPickerOpen(null); }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-amber-100 rounded mb-1"
                  style={{ backgroundColor: task.rowColor === 'amber' ? '#fef3c7' : undefined }}
                >
                  🟡 Amber
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateTask(task.id, { rowColor: 'brown' }); setColorPickerOpen(null); }}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-amber-100 rounded"
                  style={{ backgroundColor: task.rowColor === 'brown' ? '#d6c5b0' : undefined }}
                >
                  🟤 Brown
                </button>
              </div>
            </div>
          )}
          <button onClick={() => onDeleteTask(task.id)} className="p-0.5 text-slate-400 hover:text-rose-500 text-[11px]" title="Delete">×</button>
        </div>
      </td>
    </tr>
  );
}, (prev, next) => {
  // Custom comparison — only re-render if this row's data or state changed
  if (prev.task !== next.task) return false;
  if (prev.absoluteRowIdx !== next.absoluteRowIdx) return false;
  if (prev.isCollapsed !== next.isCollapsed) return false;
  if (prev.isCritical !== next.isCritical) return false;
  if (prev.childCount !== next.childCount) return false;
  if (prev.isDragging !== next.isDragging) return false;
  if (prev.isOver !== next.isOver) return false;
  if (prev.dragIndex !== next.dragIndex) return false;

  // Only re-render if editingCell changed for THIS task
  const prevEditing = prev.editingCell?.startsWith(`${prev.task.id}-`);
  const nextEditing = next.editingCell?.startsWith(`${next.task.id}-`);
  if (prevEditing || nextEditing) {
    if (prev.editingCell !== next.editingCell) return false;
  }

  // Only re-render if colorPicker changed for THIS task
  const prevPicker = prev.colorPickerOpen === prev.task.id;
  const nextPicker = next.colorPickerOpen === next.task.id;
  if (prevPicker !== nextPicker) return false;

  return true;
});

TaskRow.displayName = 'TaskRow';

// ── Main ScheduleGrid Component ──────────────────────────────────────

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
  onSendToActionLog,
  onRemoveFromActionLog,
  onRemoveFromTracker,
  isInTracker
}) => {
  const [editingCell, setEditingCell] = useState(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(null);
  const [dependenciesEditorOpen, setDependenciesEditorOpen] = useState(null);
  const [editingDependencies, setEditingDependencies] = useState([]);
  const [editingDepLogic, setEditingDepLogic] = useState('ALL');
  const [columnWidths, setColumnWidths] = useState({
    drag: 28, id: 40, name: 280, parent: 50, dep: 60, type: 70,
    dur: 55, start: 100, finish: 100, pct: 55, track: 50, actions: 150
  });
  const [resizing, setResizing] = useState(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const gridBodyRef = useRef(null);
  const scrollRafRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  const criticalPathIds = useMemo(() => {
    if ((allTasks?.length || 0) > 250) return new Set();
    return calculateCriticalPath(allTasks);
  }, [allTasks]);

  const { directChildCount } = useMemo(() => getHierarchyMap(allTasks), [allTasks]);

  const handleCellEdit = useCallback((taskId, field, value) => {
    let processedValue = value;
    if (field === 'dur' || field === 'pct') processedValue = value === "" ? 0 : parseInt(value, 10) || 0;
    else if (field === 'parent') processedValue = value === "" ? null : parseInt(value, 10) || null;
    if (field === 'type' && value === 'Milestone') onUpdateTask(taskId, { [field]: processedValue, dur: 0 });
    else onUpdateTask(taskId, { [field]: processedValue });
    setEditingCell(null);
  }, [onUpdateTask]);

  const openDependenciesEditor = useCallback((task) => {
    const deps = task.dependencies || (task.parent ? [{ parentId: task.parent, depType: task.depType || 'FS' }] : []);
    setEditingDependencies(deps.length > 0 ? deps : [{ parentId: '', depType: 'FS' }]);
    setEditingDepLogic(task.depLogic || 'ALL');
    setDependenciesEditorOpen(task.id);
  }, []);

  const saveDependencies = () => {
    const validDeps = editingDependencies.filter(d => d.parentId && d.parentId !== '');
    onUpdateTask(dependenciesEditorOpen, {
      dependencies: validDeps.length > 0 ? validDeps : null,
      depLogic: editingDepLogic,
      parent: null,
      depType: null
    });
    setDependenciesEditorOpen(null);
  };

  const addDependency = () => {
    setEditingDependencies([...editingDependencies, { parentId: '', depType: 'FS' }]);
  };

  const removeDependency = (index) => {
    setEditingDependencies(editingDependencies.filter((_, i) => i !== index));
  };

  const updateDependency = (index, field, value) => {
    const updated = [...editingDependencies];
    updated[index][field] = field === 'parentId' ? (value === '' ? '' : parseInt(value, 10) || '') : value;
    setEditingDependencies(updated);
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
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  useEffect(() => {
    const el = gridBodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight || 640);
    });
    observer.observe(el);
    setViewportHeight(el.clientHeight || 640);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const handleGridScroll = useCallback((e) => {
    const nextTop = e.currentTarget.scrollTop;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(nextTop);
    });
  }, []);

  const handleDragStart = useCallback((e, origIdx) => {
    setDragIndex(origIdx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', origIdx.toString());
    if (e.currentTarget) e.currentTarget.style.opacity = '0.4';
  }, []);

  const handleDragEnd = useCallback((e) => {
    if (e.currentTarget) e.currentTarget.style.opacity = '1';
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e, origIdx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (origIdx !== dragOverIndex) setDragOverIndex(origIdx);
  }, [dragOverIndex]);

  const handleDrop = useCallback((e, dropOrigIdx) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== dropOrigIdx) onReorderTask(dragIndex, dropOrigIdx);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, onReorderTask]);

  const ResizeHandle = ({ column }) => (
    <div
      onMouseDown={(e) => handleResizeStart(e, column)}
      style={{ position: 'absolute', right: 0, top: 0, width: '4px', height: '100%', cursor: 'col-resize', background: resizing === column ? '#6366F1' : 'transparent', zIndex: 10 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#CBD5E1'; }}
      onMouseLeave={(e) => {
        if (resizing !== column) e.currentTarget.style.background = 'transparent';
      }}
    />
  );

  const colGroupCols = (
    <colgroup>
      <col style={{ width: `${columnWidths.drag}px` }} />
      {Object.entries(columnWidths).filter(([k]) => k !== 'drag').map(([col, w]) => (
        <col key={col} style={{ width: `${w}px` }} />
      ))}
    </colgroup>
  );

  const isVirtualized = visibleTasks.length > VIRTUALIZATION_THRESHOLD;

  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight, renderTasks } = useMemo(() => {
    if (!isVirtualized) {
      return {
        startIndex: 0,
        endIndex: visibleTasks.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        renderTasks: visibleTasks
      };
    }

    const safeViewport = Math.max(ROW_HEIGHT, viewportHeight);
    const nextStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
    const nextEnd = Math.min(
      visibleTasks.length,
      Math.ceil((scrollTop + safeViewport) / ROW_HEIGHT) + OVERSCAN_ROWS
    );
    return {
      startIndex: nextStart,
      endIndex: nextEnd,
      topSpacerHeight: nextStart * ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (visibleTasks.length - nextEnd) * ROW_HEIGHT),
      renderTasks: visibleTasks.slice(nextStart, nextEnd)
    };
  }, [isVirtualized, scrollTop, viewportHeight, visibleTasks]);

  const todayMidnightTs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-none overflow-hidden" style={{ height: `${GRID_HEADER_HEIGHT}px` }}>
        <table className="grid-table">
          {colGroupCols}
          <thead>
            <tr>
              <th style={{ textAlign: 'center', padding: '8px 2px' }}>⠿</th>
              <th className="text-center">ID <ResizeHandle column="id" /></th>
              <th>Task Name <ResizeHandle column="name" /></th>
              <th className="text-center" colSpan={2} title="Dependencies (Parent ID + Type)">Dependencies</th>
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

      <div
        ref={gridBodyRef}
        className="flex-grow overflow-auto custom-scrollbar"
        id="grid-scroll"
        onScroll={handleGridScroll}
      >
        <table className="grid-table">
          {colGroupCols}
          <tbody>
            {isVirtualized && topSpacerHeight > 0 && (
              <tr aria-hidden="true" style={{ height: `${topSpacerHeight}px` }}>
                <td colSpan={TOTAL_COLS} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}

            {renderTasks.map((task, idx) => {
              const origIdx = task._originalIndex;
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  absoluteRowIdx={startIndex + idx}
                  isCollapsed={collapsedIndices.has(origIdx)}
                  isCritical={criticalPathIds.has(task.id)}
                  childCount={
                    task._isParent && collapsedIndices.has(origIdx) && directChildCount.has(origIdx)
                      ? directChildCount.get(origIdx)
                      : 0
                  }
                  isDragging={dragIndex === origIdx}
                  isOver={dragOverIndex === origIdx}
                  dragIndex={dragIndex}
                  todayMidnightTs={todayMidnightTs}
                  editingCell={editingCell}
                  colorPickerOpen={colorPickerOpen}
                  onToggleCollapse={onToggleCollapse}
                  onUpdateTask={onUpdateTask}
                  onDeleteTask={onDeleteTask}
                  onModifyHierarchy={onModifyHierarchy}
                  onToggleTrack={onToggleTrack}
                  onInsertTask={onInsertTask}
                  onSendToTracker={onSendToTracker}
                  onSendToActionLog={onSendToActionLog}
                  onRemoveFromActionLog={onRemoveFromActionLog}
                  onRemoveFromTracker={onRemoveFromTracker}
                  isInTracker={isInTracker}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onCellEdit={handleCellEdit}
                  setEditingCell={setEditingCell}
                  setColorPickerOpen={setColorPickerOpen}
                  onOpenDepsEditor={openDependenciesEditor}
                />
              );
            })}

            {isVirtualized && bottomSpacerHeight > 0 && (
              <tr aria-hidden="true" style={{ height: `${bottomSpacerHeight}px` }}>
                <td colSpan={TOTAL_COLS} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dependenciesEditorOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[9999]"
          onClick={() => setDependenciesEditorOpen(null)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl p-6 max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-800 mb-4">Edit Dependencies - Task #{dependenciesEditorOpen}</h3>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Dependency Logic:
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="depLogic"
                    value="ALL"
                    checked={editingDepLogic === 'ALL'}
                    onChange={(e) => setEditingDepLogic(e.target.value)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm">ALL (wait for all parents to finish)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="depLogic"
                    value="ANY"
                    checked={editingDepLogic === 'ANY'}
                    onChange={(e) => setEditingDepLogic(e.target.value)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm">ANY (start when any parent allows)</span>
                </label>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Dependencies:</label>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {editingDependencies.map((dep, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      type="number"
                      placeholder="Parent ID"
                      value={dep.parentId}
                      onChange={(e) => updateDependency(index, 'parentId', e.target.value)}
                      className="border border-slate-300 rounded px-3 py-2 text-sm flex-1"
                      min="1"
                    />
                    <select
                      value={dep.depType}
                      onChange={(e) => updateDependency(index, 'depType', e.target.value)}
                      className="border border-slate-300 rounded px-3 py-2 text-sm w-24"
                    >
                      <option value="FS">FS</option>
                      <option value="SS">SS</option>
                      <option value="FF">FF</option>
                      <option value="SF">SF</option>
                    </select>
                    <button
                      onClick={() => removeDependency(index)}
                      className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded text-sm font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addDependency}
                className="mt-2 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-sm font-semibold"
              >
                + Add Dependency
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDependenciesEditorOpen(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveDependencies}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ScheduleGrid);
