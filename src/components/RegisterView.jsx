import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SCHEMAS } from '../utils/constants';
import { keyGen, filterBySearch } from '../utils/helpers';
import { IconEyeOpen, IconEyeClosed, IconTrash } from './Icons';

// Columns that are short/fixed — don't need clamp/tooltip
const SHORT_COLS = ['visible', 'number', 'status', 'level', 'raised', 'target', 'completed', 'date', 'updated', 'complete', 'cost', 'billing', 'mobile', 'phone'];

const isLongTextCol = (colName) => {
  const k = colName.toLowerCase().replace(/[^a-z]/g, '');
  if (k === 'status' || k === 'number' || k === 'visible' || k === 'level' || k === 'complete') return false;
  return !SHORT_COLS.some(s => s !== 'status' && k.includes(s));
};

// ── Viewport-aware popover ─────────────────────────────────────────

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

    // If popover goes below viewport, show above
    if (top + pop.height > window.innerHeight - pad) {
      top = anchor.top - pop.height - 4;
    }
    // If still off-screen vertically, pin to top
    if (top < pad) top = pad;

    // Keep within right edge
    if (left + pop.width > window.innerWidth - pad) {
      left = window.innerWidth - pop.width - pad;
    }
    // Keep within left edge
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
        top: pos.top,
        left: pos.left,
        maxWidth: 420,
        minWidth: 200,
        maxHeight: 300,
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}
    >
      {text}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────

const RegisterView = ({ 
  registerType,
  items,
  isExternalView,
  onUpdateItem,
  onDeleteItem,
  onTogglePublic
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCell, setEditingCell] = useState(null);
  const [expandedCell, setExpandedCell] = useState(null);
  const expandAnchorRef = useRef(null);

  const schema = SCHEMAS[registerType];
  if (!schema) return null;

  const visibleCols = isExternalView 
    ? schema.cols.filter(c => c !== "Visible") 
    : schema.cols;

  const filteredItems = filterBySearch(items, searchQuery).filter(item =>
    isExternalView ? item.public : true
  );

  const handleCellEdit = (itemId, key, value) => {
    onUpdateItem(registerType, itemId, key, value);
    setEditingCell(null);
  };

  const closePopover = useCallback(() => setExpandedCell(null), []);

  const EditableCell = ({ item, colName }) => {
    const key = keyGen(colName);
    const cellId = `${item._id}-${key}`;
    const isEditing = editingCell === cellId;
    const value = item[key];
    const textValue = value || '...';
    const isLong = isLongTextCol(colName);
    const hasContent = value && value !== '...' && value.length > 40;
    const cellRef = useRef(null);

    if (colName === "Visible") {
      return (
        <td className="px-3 py-2.5 text-center w-12">
          <button
            onClick={() => onTogglePublic(registerType, item._id)}
            className="hover:text-indigo-600"
          >
            {item.public ? <IconEyeOpen /> : <IconEyeClosed />}
          </button>
        </td>
      );
    }

    if (colName === "Number") {
      return (
        <td className="px-3 py-2.5 font-mono text-slate-300 font-bold w-16 text-center">
          {textValue}
        </td>
      );
    }

    const handleClick = () => {
      if (expandedCell === cellId) {
        setExpandedCell(null);
        return;
      }
      setEditingCell(cellId);
    };

    const handleBlur = (e) => {
      handleCellEdit(item._id, key, e.target.value);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    };

    const handleExpand = (e) => {
      e.stopPropagation();
      expandAnchorRef.current = cellRef.current;
      setExpandedCell(expandedCell === cellId ? null : cellId);
    };

    if (isEditing) {
      return (
        <td className="px-3 py-2.5">
          <input
            autoFocus
            type="text"
            defaultValue={value === "..." ? "" : value}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="editing-input bg-indigo-50"
          />
        </td>
      );
    }

    if (isLong) {
      return (
        <td
          ref={cellRef}
          className="px-3 py-2.5 editable relative"
          onClick={handleClick}
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
              {textValue}
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

          {expandedCell === cellId && (
            <CellPopover text={value} anchorRef={{ current: cellRef.current }} onClose={closePopover} />
          )}
        </td>
      );
    }

    return (
      <td
        className="px-3 py-2.5 editable"
        onClick={handleClick}
      >
        {textValue}
      </td>
    );
  };

  return (
    <div className="w-full h-full bg-slate-50 p-4 sm:p-6 overflow-auto">
      <div className="max-w-[1650px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[500px]">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex justify-between items-center rounded-t-xl">
          <h2 className="text-base font-bold text-slate-800 tracking-tight">
            {schema.title}
          </h2>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-[12px] border border-slate-200 rounded-lg w-48 sm:w-64 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b">
              <tr>
                {visibleCols.map(col => (
                  <th
                    key={col}
                    className={`px-3 py-3 border-b whitespace-nowrap ${
                      col === 'Visible' ? 'w-12 text-center' : 
                      col === 'Number' ? 'w-16 text-center' : 
                      col === 'Status' || col === 'Level' || col === 'Complete' ? 'w-20' :
                      col === 'Raised' || col === 'Target' || col === 'Completed' || col === 'Date' || col === 'Updated' ? 'w-28' :
                      col === 'Owner' || col === 'Category' ? 'w-32' :
                      ''
                    }`}
                  >
                    {col === 'Visible' ? (
                      <IconEyeOpen />
                    ) : (
                      col
                    )}
                  </th>
                ))}
                <th className="px-3 py-3 border-b w-12 text-center">
                  <IconTrash />
                </th>
              </tr>
            </thead>
            <tbody className="text-[12px] text-slate-700">
              {filteredItems.map(item => (
                <tr
                  key={item._id}
                  className={`border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${
                    !item.public ? 'bg-slate-50/50' : ''
                  }`}
                >
                  {visibleCols.map(col => (
                    <EditableCell key={col} item={item} colName={col} />
                  ))}
                  <td className="px-3 py-2.5 text-center w-12">
                    <button
                      onClick={() => onDeleteItem(registerType, item._id)}
                      className="text-slate-300 hover:text-rose-500 transition-colors"
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              No entries found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(RegisterView);
