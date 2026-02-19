import { useState, useRef, useEffect } from 'react';

const GRID_HEADER_HEIGHT = 60; // Increased from 34 to 60 to match GanttChart
const ROW_HEIGHT = 34;

export default function ScheduleGrid({
  tasks = [],
  onUpdate = () => {},
  onIndent = () => {},
  onOutdent = () => {},
  onInsert = () => {},
  onDelete = () => {},
  collapsedIndices = new Set(),
  onToggleCollapse = () => {},
  onSendToTracker = () => {},
  isInTracker = () => false,
  scrollTop = 0,
  onScrollChange = () => {}
}) {
  const containerRef = useRef(null);
  const [editingCell, setEditingCell] = useState(null);

  // Sync scroll from Gantt
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.scrollTop = scrollTop;
  }, [scrollTop]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    onScrollChange(containerRef.current.scrollTop);
  };

  const handleCellClick = (rowIndex, field) => {
    const task = tasks[rowIndex];
    // Don't allow editing duration for parents or milestones
    if (field === 'dur' && (task._isParent || task.type === 'Milestone')) return;
    setEditingCell({ rowIndex, field });
  };

  const handleCellChange = (rowIndex, field, value) => {
    onUpdate(rowIndex, field, value);
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const handleKeyDown = (e, rowIndex, field) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditingCell(null);
    }
  };

  const visibleTasks = tasks.map((t, i) => ({ ...t, originalIndex: i }));

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const renderCell = (task, rowIndex, field) => {
    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.field === field;
    const value = task[field] ?? '';

    // Special rendering for certain fields
    if (field === 'type') {
      return isEditing ? (
        <select
          autoFocus
          value={value}
          onChange={(e) => handleCellChange(rowIndex, field, e.target.value)}
          onBlur={handleCellBlur}
          className="w-full h-full px-2 text-[12.5px] border-2 border-indigo-500 outline-none"
        >
          <option value="Task">Task</option>
          <option value="Milestone">Milestone</option>
        </select>
      ) : (
        <div
          onClick={() => handleCellClick(rowIndex, field)}
          className="px-2 py-1 cursor-pointer hover:bg-slate-100 text-[12.5px]"
        >
          {value === 'Milestone' ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-amber-600">◆</span>
              <span>MS</span>
            </span>
          ) : (
            value || 'Task'
          )}
        </div>
      );
    }

    if (field === 'start') {
      return isEditing ? (
        <input
          type="date"
          autoFocus
          value={formatDate(value)}
          onChange={(e) => handleCellChange(rowIndex, field, e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={(e) => handleKeyDown(e, rowIndex, field)}
          className="w-full h-full px-2 text-[12.5px] border-2 border-indigo-500 outline-none"
        />
      ) : (
        <div
          onClick={() => handleCellClick(rowIndex, field)}
          className="px-2 py-1 cursor-pointer hover:bg-slate-100 text-[12.5px]"
        >
          {formatDate(value)}
        </div>
      );
    }

    if (field === 'dur') {
      const isDisabled = task._isParent || task.type === 'Milestone';
      return isEditing && !isDisabled ? (
        <input
          type="number"
          autoFocus
          value={value}
          onChange={(e) => handleCellChange(rowIndex, field, e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={(e) => handleKeyDown(e, rowIndex, field)}
          className="w-full h-full px-2 text-[12.5px] border-2 border-indigo-500 outline-none"
        />
      ) : (
        <div
          onClick={() => !isDisabled && handleCellClick(rowIndex, field)}
          className={`px-2 py-1 text-[12.5px] ${
            isDisabled
              ? 'text-slate-400 bg-slate-50 cursor-not-allowed'
              : 'cursor-pointer hover:bg-slate-100'
          }`}
          title={isDisabled ? (task._isParent ? 'Auto-calculated from children' : 'Milestones have 0 duration') : ''}
        >
          {value}
          {value && 'd'}
        </div>
      );
    }

    if (field === 'progress') {
      return isEditing ? (
        <input
          type="number"
          autoFocus
          min="0"
          max="100"
          value={value}
          onChange={(e) => handleCellChange(rowIndex, field, e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={(e) => handleKeyDown(e, rowIndex, field)}
          className="w-full h-full px-2 text-[12.5px] border-2 border-indigo-500 outline-none"
        />
      ) : (
        <div
          onClick={() => handleCellClick(rowIndex, field)}
          className="px-2 py-1 cursor-pointer hover:bg-slate-100 text-[12.5px]"
        >
          {value}%
        </div>
      );
    }

    // Default text input
    return isEditing ? (
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => handleCellChange(rowIndex, field, e.target.value)}
        onBlur={handleCellBlur}
        onKeyDown={(e) => handleKeyDown(e, rowIndex, field)}
        className="w-full h-full px-2 text-[12.5px] border-2 border-indigo-500 outline-none"
      />
    ) : (
      <div
        onClick={() => handleCellClick(rowIndex, field)}
        className="px-2 py-1 cursor-pointer hover:bg-slate-100 text-[12.5px] truncate"
      >
        {value}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Fixed header - matches GanttChart header height */}
      <div 
        className="grid-table-header border-b border-slate-200 bg-slate-50"
        style={{ 
          height: `${GRID_HEADER_HEIGHT}px`,
          display: 'grid',
          gridTemplateColumns: '40px 50px 300px 60px 80px 60px 110px 110px 80px 80px 180px',
          alignItems: 'center'
        }}
      >
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider"></div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">ID</div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Task Name</div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Dep</div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Type</div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Dur</div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Start Date</div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Finish</div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Progr%</div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">Track</div>
        <div className="px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider text-center">Actions</div>
      </div>

      {/* Scrollable body */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-scroll overflow-x-hidden"
        style={{ height: `calc(100% - ${GRID_HEADER_HEIGHT}px)` }}
      >
        <div className="grid-table-body">
          {visibleTasks.map((task, idx) => {
            const originalIndex = task.originalIndex;
            const isHidden = collapsedIndices.has(originalIndex);
            if (isHidden) return null;

            const isParent = task._isParent;
            const hasChildren = tasks[originalIndex + 1]?.indent > task.indent;
            const isCollapsed = collapsedIndices.has(originalIndex);

            return (
              <div
                key={task.id}
                className={`grid-table-row ${idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 50px 300px 60px 80px 60px 110px 110px 80px 80px 180px',
                  height: `${ROW_HEIGHT}px`,
                  alignItems: 'center',
                  borderBottom: '1px solid #e2e8f0'
                }}
              >
                {/* Collapse toggle */}
                <div className="px-2 flex items-center justify-center">
                  {hasChildren && (
                    <button
                      onClick={() => onToggleCollapse(originalIndex)}
                      className="text-slate-600 hover:text-slate-900 text-sm"
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                  )}
                </div>

                {/* ID */}
                <div className="px-2 text-[12.5px] text-slate-600">{task.id}</div>

                {/* Task Name with indent */}
                <div className="flex items-center">
                  <div style={{ width: `${task.indent * 20}px` }} />
                  {renderCell(task, originalIndex, 'name')}
                  {isParent && (
                    <span className="ml-2 px-2 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-100 rounded">
                      GROUP
                    </span>
                  )}
                  {task._isCritical && (
                    <span className="ml-2 px-2 py-0.5 text-[10px] font-bold text-purple-700 bg-purple-100 rounded">
                      CP
                    </span>
                  )}
                </div>

                {/* Dep */}
                {renderCell(task, originalIndex, 'dep')}

                {/* Type */}
                {renderCell(task, originalIndex, 'type')}

                {/* Duration */}
                {renderCell(task, originalIndex, 'dur')}

                {/* Start Date */}
                {renderCell(task, originalIndex, 'start')}

                {/* Finish */}
                <div className="px-2 py-1 text-[12.5px] text-slate-600">
                  {formatDate(task.finish)}
                </div>

                {/* Progress */}
                {renderCell(task, originalIndex, 'progress')}

                {/* Track checkbox */}
                <div className="px-2 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isInTracker(task.id)}
                    readOnly
                    className="w-4 h-4 cursor-default"
                  />
                </div>

                {/* Actions */}
                <div className="px-2 flex items-center justify-center gap-1">
                  {task.indent > 0 && (
                    <button
                      onClick={() => onOutdent(originalIndex)}
                      className="px-2 py-1 text-[11px] text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                      title="Outdent"
                    >
                      ←
                    </button>
                  )}
                  {task.indent < 2 && (
                    <button
                      onClick={() => onIndent(originalIndex)}
                      className="px-2 py-1 text-[11px] text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                      title="Indent"
                    >
                      →
                    </button>
                  )}
                  <button
                    onClick={() => onInsert(originalIndex)}
                    className="px-2 py-1 text-[11px] text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                    title="Insert task below"
                  >
                    +
                  </button>
                  <button
                    onClick={() => onSendToTracker(task)}
                    className={`px-2 py-1 text-[11px] rounded ${
                      isInTracker(task.id)
                        ? 'text-emerald-600 bg-emerald-50'
                        : 'text-slate-600 hover:text-emerald-600 hover:bg-emerald-50'
                    }`}
                    title={isInTracker(task.id) ? 'In tracker' : 'Send to tracker'}
                  >
                    ▸
                  </button>
                  <button
                    onClick={() => onDelete(originalIndex)}
                    className="px-2 py-1 text-[11px] text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
