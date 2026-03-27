import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { getFinishDate, calculateCriticalPath, getHierarchyMap, formatDependencies, getTaskDependencies, hasDependencies } from '../utils/helpers';

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

const HEADER_HELP = {
  dependencies: 'Click a task dependency cell to link tasks. Use FS/SS/FF/SF to control how dates move together.',
  type: 'Task is a normal activity, Milestone is a zero-duration checkpoint, and GROUP rows summarise child tasks.',
  dur: 'Duration is shown in working days.',
  start: 'Tasks with dependencies have start dates driven automatically by those links.',
  progress: '0% means not started, 1-99% means in progress, 100% means complete.',
  track: 'Track adds the task to the task list / Action Log feed for follow-up.',
  actions: 'MT+ sends the task to Master Tracker. AL+ sends it to Action Log.',
};

const getDependencyTaskLabel = (task) => {
  if (!task) return '';
  return `#${task.id} - ${task.name || 'Untitled task'}`;
};

const getDependencyTooltip = (task, taskMap) => {
  const deps = getTaskDependencies(task);
  if (deps.length === 0) return 'No dependencies';

  return deps
    .map((dep) => {
      const parentTask = taskMap.get(dep.parentId);
      if (!parentTask) return `#${dep.parentId} (${dep.depType})`;
      return `${getDependencyTaskLabel(parentTask)} (${dep.depType})`;
    })
    .join('\n');
};

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
  onCellEdit, setEditingCell, setColorPickerOpen, onOpenDepsEditor,
  dependencyTitle
}) => {
  const origIdx = task._originalIndex;
  const isParentRow = task._isParent;
  const isMilestone = task.type === 'Milestone';
  const finishDate = getFinishDate(task.start, task.dur);
  const isEven = absoluteRowIdx % 2 === 0;

  const getRowColor = () => {
    if (task.rowColor) {
      const colorMap = { red: '#ffe8eb', amber: '#fbf0cf', brown: '#e8dccb' };
      return colorMap[task.rowColor] || null;
    }
    if (isDragging) return '#f3eeff';
    if (isParentRow) return '#f8f4ec';
    const taskFinish = new Date(finishDate);
    taskFinish.setHours(0, 0, 0, 0);
    const isPastDeadline = taskFinish.getTime() < todayMidnightTs && task.pct < 100;
    if (isPastDeadline) return '#fff0f3';
    if (task.pct === 100) return '#e8f7ef';
    if (task.pct > 0 && task.pct < 100) return '#f7f1ff';
    return isEven ? '#ffffff' : '#fcfbf8';
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
      <td style={{ textAlign: 'center', cursor: 'grab', padding: '0 2px', userSelect: 'none' }} className="text-slate-300 hover:text-violet-500 text-[11px]" title="Drag to reorder">⠿</td>

      <td className="text-center text-slate-400 font-mono text-[11px]">{task.id}</td>

      <EditableCell task={task} field="name" {...ecProps}>
        <div style={{ paddingLeft: `${(task.indent || 0) * 18}px` }} className="flex items-center gap-1">
          {isParentRow ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(origIdx); }}
              className="text-slate-400 hover:text-violet-600 w-4 h-4 flex items-center justify-center flex-shrink-0"
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
            <span className={`truncate text-[12.5px] ${isParentRow ? 'font-semibold text-slate-800' : 'font-medium text-slate-700'}`}>
              {task.name}
            </span>
          {isParentRow && isCollapsed && childCount > 0 && (
            <span className="text-[8px] text-slate-400 bg-slate-200 px-1 py-px rounded flex-shrink-0">
              +{childCount}
            </span>
          )}
          {isCritical && (
            <span className="text-[7px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1 py-px rounded flex-shrink-0">CP</span>
          )}
        </div>
      </EditableCell>

      <td
        className="text-center text-[10px] text-slate-600 cursor-pointer hover:bg-indigo-50 px-2"
        onClick={() => !isParentRow && onOpenDepsEditor(task)}
        title={`${dependencyTitle}\nClick to edit dependencies`}
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
                className="px-1.5 py-0.5 text-[9px] font-semibold border rounded text-violet-700 border-violet-200 bg-violet-50 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                title="Remove from Master Tracker"
              >
                MT✓
              </button>
            ) : (
              <button
                onClick={() => onSendToTracker(task.id)}
                className="px-1.5 py-0.5 text-[9px] font-semibold border rounded text-slate-500 border-slate-200 hover:text-violet-600 hover:border-violet-300 hover:bg-violet-50"
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
                className="p-0.5 text-slate-400 hover:text-violet-600 text-[11px]"
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
                className="pm-surface-card rounded-xl p-3"
                onClick={(e) => e.stopPropagation()}
                style={{ minWidth: '160px' }}
              >
                <div className="mb-2 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">Choose Row Color</div>
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
  isMobile = false,
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
  const [dependencySearch, setDependencySearch] = useState('');
  const [columnWidths, setColumnWidths] = useState({
    drag: 28, id: 40, name: 280, parent: 50, dep: 60, type: 70,
    dur: 55, start: 100, finish: 100, pct: 55, track: 50, actions: 150
  });
  const [resizing, setResizing] = useState(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [openHelpKey, setOpenHelpKey] = useState(null);
  const headerScrollRef = useRef(null);
  const gridBodyRef = useRef(null);
  const scrollRafRef = useRef(null);
  const horizontalSyncRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  useEffect(() => {
    setColumnWidths(prev => {
      if (isMobile) {
        return {
          ...prev,
          name: 220,
          start: 88,
          finish: 88,
          actions: 132,
        };
      }

      return {
        ...prev,
        name: 280,
        start: 100,
        finish: 100,
        actions: 150,
      };
    });
  }, [isMobile]);

  const criticalPathIds = useMemo(() => {
    if ((allTasks?.length || 0) > 250) return new Set();
    return calculateCriticalPath(allTasks);
  }, [allTasks]);

  const { directChildCount } = useMemo(() => getHierarchyMap(allTasks), [allTasks]);
  const allTaskLookup = useMemo(
    () => new Map(allTasks.map((task) => [task.id, task])),
    [allTasks]
  );
  const dependencyTaskOptions = useMemo(() => {
    if (!dependenciesEditorOpen) return [];

    return allTasks
      .filter((task) => task.id !== dependenciesEditorOpen)
      .map((task) => ({
        value: task.id,
        label: getDependencyTaskLabel(task),
        task,
      }));
  }, [allTasks, dependenciesEditorOpen]);
  const filteredDependencyTaskOptions = useMemo(() => {
    const query = dependencySearch.trim().toLowerCase();
    if (!query) return dependencyTaskOptions;

    return dependencyTaskOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [dependencySearch, dependencyTaskOptions]);
  const dependencyOptionTaskMap = useMemo(
    () => new Map(dependencyTaskOptions.map((option) => [option.value, option.task])),
    [dependencyTaskOptions]
  );
  const activeDependencyTask = useMemo(
    () => allTaskLookup.get(dependenciesEditorOpen) || null,
    [allTaskLookup, dependenciesEditorOpen]
  );

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
    setDependencySearch('');
    setDependenciesEditorOpen(task.id);
  }, []);

  const saveDependencies = () => {
    const seenParents = new Set();
    const validDeps = editingDependencies.filter((dep) => {
      if (!dep.parentId || dep.parentId === '' || dep.parentId === dependenciesEditorOpen) return false;
      const depKey = `${dep.parentId}-${dep.depType}`;
      if (seenParents.has(depKey)) return false;
      seenParents.add(depKey);
      return true;
    });
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
    const headerEl = headerScrollRef.current;

    if (headerEl && horizontalSyncRef.current !== headerEl) {
      horizontalSyncRef.current = e.currentTarget;
      headerEl.scrollLeft = e.currentTarget.scrollLeft;
      requestAnimationFrame(() => {
        if (horizontalSyncRef.current === e.currentTarget) {
          horizontalSyncRef.current = null;
        }
      });
    }

    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(nextTop);
    });
  }, []);

  const handleHeaderScroll = useCallback((e) => {
    const bodyEl = gridBodyRef.current;
    if (!bodyEl || horizontalSyncRef.current === bodyEl) return;

    horizontalSyncRef.current = e.currentTarget;
    bodyEl.scrollLeft = e.currentTarget.scrollLeft;
    requestAnimationFrame(() => {
      if (horizontalSyncRef.current === e.currentTarget) {
        horizontalSyncRef.current = null;
      }
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

  const HelpBadge = ({ helpKey, text }) => {
    const tooltipId = `schedule-help-${helpKey}`;
    const isOpen = openHelpKey === helpKey;

    return (
      <span
        className="relative ml-1 inline-flex align-middle"
        onMouseEnter={() => setOpenHelpKey(helpKey)}
        onMouseLeave={() => setOpenHelpKey((current) => (current === helpKey ? null : current))}
      >
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[9px] font-bold text-slate-400 transition-colors hover:border-indigo-300 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          aria-label={text}
          aria-describedby={isOpen ? tooltipId : undefined}
          onFocus={() => setOpenHelpKey(helpKey)}
          onBlur={() => setOpenHelpKey((current) => (current === helpKey ? null : current))}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpenHelpKey(null);
              e.currentTarget.blur();
            }
          }}
        >
          ?
        </button>
        {isOpen && (
          <span
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-52 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-white shadow-xl"
          >
            {text}
          </span>
        )}
      </span>
    );
  };

  const colGroupCols = (
    <colgroup>
      <col style={{ width: `${columnWidths.drag}px` }} />
      {Object.entries(columnWidths).filter(([k]) => k !== 'drag').map(([col, w]) => (
        <col key={col} style={{ width: `${w}px` }} />
      ))}
    </colgroup>
  );

  const isVirtualized = visibleTasks.length > VIRTUALIZATION_THRESHOLD;
  const tableMinWidth = useMemo(
    () => Object.values(columnWidths).reduce((sum, width) => sum + width, 0),
    [columnWidths]
  );

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
    <div className="h-full min-w-0 flex flex-col">
      <div
        ref={headerScrollRef}
        className="flex-none overflow-x-auto overflow-y-hidden no-scrollbar"
        style={{ height: `${GRID_HEADER_HEIGHT}px` }}
        onScroll={handleHeaderScroll}
      >
        <table className="grid-table" style={{ minWidth: `${tableMinWidth}px` }}>
          {colGroupCols}
          <thead>
            <tr>
              <th style={{ textAlign: 'center', padding: '8px 2px' }}>⠿</th>
              <th className="text-center">ID <ResizeHandle column="id" /></th>
              <th>Task Name <ResizeHandle column="name" /></th>
              <th className="text-center" colSpan={2} title="Dependencies (linked task + type)">Dependencies <HelpBadge helpKey="dependencies" text={HEADER_HELP.dependencies} /></th>
              <th className="text-center">Type <HelpBadge helpKey="type" text={HEADER_HELP.type} /><ResizeHandle column="type" /></th>
              <th className="text-center">Dur <HelpBadge helpKey="dur" text={HEADER_HELP.dur} /><ResizeHandle column="dur" /></th>
              <th>Start Date <HelpBadge helpKey="start" text={HEADER_HELP.start} /><ResizeHandle column="start" /></th>
              <th>Finish <ResizeHandle column="finish" /></th>
              <th className="text-center">Progress <HelpBadge helpKey="progress" text={HEADER_HELP.progress} /><ResizeHandle column="pct" /></th>
              <th className="text-center">Track <HelpBadge helpKey="track" text={HEADER_HELP.track} /><ResizeHandle column="track" /></th>
              <th className="text-center" style={{ borderRight: 'none' }}>Actions <HelpBadge helpKey="actions" text={HEADER_HELP.actions} /></th>
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
        <table className="grid-table" style={{ minWidth: `${tableMinWidth}px` }}>
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
                  dependencyTitle={getDependencyTooltip(task, allTaskLookup)}
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
            <h3 className="text-lg font-bold text-slate-800 mb-1">Edit Dependencies - Task #{dependenciesEditorOpen}</h3>
            {activeDependencyTask && (
              <p className="mb-4 text-sm text-slate-500">
                Working on <span className="font-medium text-slate-700">{activeDependencyTask.name}</span>
              </p>
            )}

            <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-slate-600">
              <div className="font-semibold text-slate-700">How dependency links work</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div><span className="font-semibold text-slate-700">FS</span> = start after the parent task finishes</div>
                <div><span className="font-semibold text-slate-700">SS</span> = start when the parent task starts</div>
                <div><span className="font-semibold text-slate-700">FF</span> = finish when the parent task finishes</div>
                <div><span className="font-semibold text-slate-700">SF</span> = finish when the parent task starts</div>
              </div>
              <div className="mt-2 text-slate-500">
                Tip: once a task has dependencies, its start date is driven automatically by those links.
              </div>
            </div>

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
                  <span className="text-sm">ALL (wait for every linked parent)</span>
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
                  <span className="text-sm">ANY (start when one linked parent allows)</span>
                </label>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Dependencies:</label>
              <p className="mb-3 text-sm text-slate-500">
                Choose the parent task you want to link to, then choose how the dates should move together.
              </p>
              {dependencyTaskOptions.length > 0 && (
                <input
                  type="text"
                  value={dependencySearch}
                  onChange={(e) => setDependencySearch(e.target.value)}
                  placeholder="Search tasks by ID or name"
                  className="mb-3 w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              )}
              {dependencyTaskOptions.length === 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Add at least one more task before creating a dependency link.
                </div>
              )}
              {dependencyTaskOptions.length > 0 && filteredDependencyTaskOptions.length === 0 && (
                <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  No tasks match that search yet.
                </div>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {editingDependencies.map((dep, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <select
                        value={dep.parentId === '' ? '' : String(dep.parentId)}
                        onChange={(e) => updateDependency(index, 'parentId', e.target.value)}
                        className="border border-slate-300 rounded px-3 py-2 text-sm flex-1 bg-white"
                      >
                        <option value="">Choose parent task</option>
                        {filteredDependencyTaskOptions.map((option) => (
                          <option key={option.value} value={String(option.value)}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={dep.depType}
                        onChange={(e) => updateDependency(index, 'depType', e.target.value)}
                        className="border border-slate-300 rounded px-3 py-2 text-sm md:w-36 bg-white"
                      >
                        <option value="FS">FS - finish to start</option>
                        <option value="SS">SS - start to start</option>
                        <option value="FF">FF - finish to finish</option>
                        <option value="SF">SF - start to finish</option>
                      </select>
                      <button
                        onClick={() => removeDependency(index)}
                        className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded text-sm font-semibold md:self-stretch"
                      >
                        Remove
                      </button>
                    </div>
                    {dep.parentId && dependencyOptionTaskMap.has(dep.parentId) && (
                      <div className="mt-2 text-xs text-slate-500">
                        Linked parent: <span className="font-medium text-slate-700">{getDependencyTaskLabel(dependencyOptionTaskMap.get(dep.parentId))}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addDependency}
                disabled={dependencyTaskOptions.length === 0}
                className="mt-2 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
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
