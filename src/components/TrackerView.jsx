import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { TRACKER_COLS } from '../utils/constants';
import { filterBySearch } from '../utils/helpers';
import { IconTrash } from './Icons';

// ── Viewport-aware popover (shared pattern) ────────────────────────

const CellPopover = ({ text, anchorRef, onClose }) => {
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef?.current || !popRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const pop = popRef.current.getBoundingClientRect();
    const pad = 8;
    let top = anchor.bottom + 4;
    let left = anchor.left;
    if (top + pop.height > window.innerHeight - pad) top = anchor.top - pop.height - 4;
    if (top < pad) top = pad;
    if (left + pop.width > window.innerWidth - pad) left = window.innerWidth - pop.width - pad;
    if (left < pad) left = pad;
    setPos({ top, left });
  }, [anchorRef]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  return (
    <div
      ref={popRef}
      className="fixed z-[9999] bg-slate-800 text-white text-[12px] leading-relaxed rounded-lg shadow-2xl p-3.5"
      style={{
        top: pos.top, left: pos.left,
        maxWidth: 420, minWidth: 200, maxHeight: 300,
        overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
      }}
    >
      {text}
    </div>
  );
};

const RAG_COLORS = {
  Green: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  Amber: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  Red: { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500' }
};

const STATUS_COLORS = {
  'Not Started': 'text-slate-400',
  'In Progress': 'text-blue-600',
  'On Hold': 'text-amber-600',
  'Completed': 'text-emerald-600',
  'Cancelled': 'text-rose-400'
};

const TrackerView = ({
  trackerItems,
  tasks,
  onUpdateItem,
  onRemoveItem,
  onNavigateToSchedule
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCell, setEditingCell] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedCell, setExpandedCell] = useState(null);
  const expandAnchorRef = useRef(null);
  const closePopover = useCallback(() => setExpandedCell(null), []);

  // Filter items
  const filteredItems = useMemo(() => {
    let items = trackerItems;
    if (filterStatus !== 'all') {
      items = items.filter(item => item.status === filterStatus);
    }
    if (searchQuery) {
      items = filterBySearch(items, searchQuery);
    }
    return items;
  }, [trackerItems, filterStatus, searchQuery]);

  // Summary stats
  const stats = useMemo(() => {
    const total = trackerItems.length;
    const completed = trackerItems.filter(t => t.status === 'Completed').length;
    const inProgress = trackerItems.filter(t => t.status === 'In Progress').length;
    const redItems = trackerItems.filter(t => t.rag === 'Red').length;
    const amberItems = trackerItems.filter(t => t.rag === 'Amber').length;
    return { total, completed, inProgress, redItems, amberItems };
  }, [trackerItems]);

  // Get linked task progress
  const getTaskProgress = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    return task ? task.pct : null;
  };

  const handleCellEdit = (itemId, key, value) => {
    onUpdateItem(itemId, key, value);
    setEditingCell(null);
  };

  const EditableCell = ({ item, col }) => {
    const cellId = `${item._id}-${col.key}`;
    const isEditing = editingCell === cellId;
    const value = item[col.key] || '';

    // Non-editable: Task Name (link to Project Plan)
    if (!col.editable) {
      if (col.key === 'taskName') {
        const hasLongName = value && value.length > 30;
        return (
          <td className={`px-4 py-3 ${hasLongName ? 'cell-with-tooltip' : ''}`}>
            <button
              onClick={() => onNavigateToSchedule && onNavigateToSchedule(item.taskId)}
              className="text-left text-indigo-600 hover:text-indigo-800 font-medium text-[12.5px] hover:underline block max-w-full"
              title="Go to task in Project Plan"
            >
              <span className="cell-clamp">{value}</span>
            </button>
            {getTaskProgress(item.taskId) !== null && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${getTaskProgress(item.taskId) === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${getTaskProgress(item.taskId)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400">{getTaskProgress(item.taskId)}%</span>
              </div>
            )}
            {hasLongName && (
              <div className="cell-tooltip">{value}</div>
            )}
          </td>
        );
      }
      // Date fields
      return (
        <td className="px-4 py-3 text-[11px] text-slate-400 font-mono">
          {value}
        </td>
      );
    }

    // RAG column
    if (col.key === 'rag') {
      if (isEditing) {
        return (
          <td className="px-4 py-3">
            <select
              autoFocus
              defaultValue={value}
              onBlur={(e) => handleCellEdit(item._id, col.key, e.target.value)}
              onChange={(e) => handleCellEdit(item._id, col.key, e.target.value)}
              className="editing-input text-[12px]"
            >
              {col.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </td>
        );
      }
      const colors = RAG_COLORS[value] || RAG_COLORS.Green;
      return (
        <td
          className="px-4 py-3 editable text-center cursor-pointer"
          onClick={() => setEditingCell(cellId)}
        >
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${colors.bg} ${colors.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
            {value}
          </span>
        </td>
      );
    }

    // Status column
    if (col.key === 'status') {
      if (isEditing) {
        return (
          <td className="px-4 py-3">
            <select
              autoFocus
              defaultValue={value}
              onBlur={(e) => handleCellEdit(item._id, col.key, e.target.value)}
              onChange={(e) => handleCellEdit(item._id, col.key, e.target.value)}
              className="editing-input text-[12px]"
            >
              {col.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </td>
        );
      }
      const statusColor = STATUS_COLORS[value] || 'text-slate-500';
      return (
        <td
          className="px-4 py-3 editable cursor-pointer"
          onClick={() => setEditingCell(cellId)}
        >
          <span className={`text-[11px] font-semibold ${statusColor}`}>
            {value || 'Not Started'}
          </span>
        </td>
      );
    }

    // Generic editable text (notes, nextAction, owner, etc.)
    const isLongField = ['notes', 'nextAction', 'taskName'].includes(col.key);
    const hasContent = value && value !== '...' && value.length > 30;

    if (isEditing) {
      return (
        <td className="px-4 py-3">
          <input
            autoFocus
            type="text"
            defaultValue={value === '...' ? '' : value}
            onBlur={(e) => handleCellEdit(item._id, col.key, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            className="editing-input text-[12px]"
          />
        </td>
      );
    }

    if (isLongField) {
      const cellRef = React.createRef();
      const thisCellId = cellId;
      const handleExpand = (e) => {
        e.stopPropagation();
        expandAnchorRef.current = cellRef.current;
        setExpandedCell(expandedCell === thisCellId ? null : thisCellId);
      };
      return (
        <td
          ref={cellRef}
          className={`px-3 py-2.5 ${col.editable ? 'editable cursor-pointer' : ''} text-[12px] text-slate-600 relative`}
          onClick={() => col.editable && setEditingCell(cellId)}
        >
          <div className="flex items-start gap-1.5">
            <div 
              className="overflow-hidden text-ellipsis flex-1 min-w-0"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                lineHeight: '1.4em',
                maxHeight: '2.8em'
              }}
            >
              {value || <span className="text-slate-300">...</span>}
            </div>
            {hasContent && (
              <button
                onClick={handleExpand}
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors mt-0.5"
                title="Expand"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
            )}
          </div>
          {expandedCell === thisCellId && (
            <CellPopover text={value} anchorRef={{ current: cellRef.current }} onClose={closePopover} />
          )}
        </td>
      );
    }

    return (
      <td
        className={`px-4 py-3 ${col.editable ? 'editable cursor-pointer' : ''} text-[12.5px] text-slate-600`}
        onClick={() => col.editable && setEditingCell(cellId)}
      >
        {value || <span className="text-slate-300">...</span>}
      </td>
    );
  };

  return (
    <div className="w-full h-full bg-slate-50 p-4 sm:p-6 overflow-auto">
      <div className="max-w-[1650px] mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Tracked</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{stats.total}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">In Progress</div>
            <div className="text-2xl font-black text-blue-600 mt-1">{stats.inProgress}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Completed</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{stats.completed}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Amber</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{stats.amberItems}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
            <div className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Red</div>
            <div className="text-2xl font-black text-rose-600 mt-1">{stats.redItems}</div>
          </div>
        </div>

        {/* Main Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[400px]">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex justify-between items-center rounded-t-xl">
            <h2 className="text-base font-bold text-slate-800 tracking-tight">
              Project Master Tracker
            </h2>
            <div className="flex items-center gap-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2.5 py-1.5 rounded-md outline-none cursor-pointer hover:border-slate-300"
              >
                <option value="all">All Status</option>
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <input
                type="text"
                placeholder="Search tracker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 text-[12px] border border-slate-200 rounded-lg w-48 sm:w-64 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b">
                <tr>
                  {TRACKER_COLS.map(col => (
                    <th
                      key={col.key}
                      className="px-4 py-4 border-b"
                      style={{ minWidth: `${col.width}px` }}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-4 border-b w-16 text-center">Act</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {filteredItems.map(item => (
                  <tr
                    key={item._id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-all group"
                  >
                    {TRACKER_COLS.map(col => (
                      <EditableCell key={col.key} item={item} col={col} />
                    ))}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onRemoveItem(item._id)}
                        className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove from tracker"
                      >
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredItems.length === 0 && (
              <div className="text-center py-16">
                <div className="text-slate-300 text-4xl mb-3">📋</div>
                <div className="text-slate-400 text-sm font-medium">
                  {trackerItems.length === 0
                    ? 'No tasks tracked yet'
                    : 'No items match your filter'}
                </div>
                {trackerItems.length === 0 && (
                  <div className="text-slate-300 text-xs mt-2">
                    Use the <span className="font-semibold text-indigo-400">▸</span> button in the Project Plan grid to send tasks here
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(TrackerView);
