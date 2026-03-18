import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { SCHEMAS } from '../utils/constants';
import { keyGen } from '../utils/helpers';
import { applyRegisterView, getRegisterViewConfig } from '../utils/registerViewUtils';
import { IconEyeOpen, IconEyeClosed, IconTrash } from './Icons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MobileRegisterList from './mobile/MobileRegisterList';

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

const HeaderMenuPopover = ({
  anchorRect,
  title,
  sortValue,
  sortOptions = [],
  filterValue = 'all',
  filterOptions = [],
  filterLabel = 'Filter',
  onSortChange,
  onFilterChange,
  onClose
}) => {
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRect || !popRef.current) return;
    const pop = popRef.current.getBoundingClientRect();
    const pad = 8;
    let top = anchorRect.bottom + 6;
    let left = anchorRect.left;

    if (left + pop.width > window.innerWidth - pad) {
      left = window.innerWidth - pop.width - pad;
    }
    if (left < pad) left = pad;

    if (top + pop.height > window.innerHeight - pad) {
      top = Math.max(pad, anchorRect.top - pop.height - 6);
    }

    setPos({ top, left });
  }, [anchorRect]);

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
      className="fixed z-[9999] w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </div>

      {sortOptions.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-[11px] font-semibold text-slate-500">Sort</div>
          <div className="space-y-1">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onSortChange(option.value);
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors ${
                  sortValue === option.value
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{option.label}</span>
                {sortValue === option.value && <span className="text-indigo-600">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {filterOptions.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-2 text-[11px] font-semibold text-slate-500">{filterLabel}</div>
          <select
            value={filterValue}
            onChange={(e) => {
              onFilterChange(e.target.value);
              onClose();
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All</option>
            {filterOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      )}
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState('default');
  const [headerMenu, setHeaderMenu] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [expandedCell, setExpandedCell] = useState(null);
  const expandAnchorRef = useRef(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const schema = SCHEMAS[registerType];
  if (!schema) return null;

  const visibleCols = isExternalView 
    ? schema.cols.filter(c => c !== "Visible") 
    : schema.cols;

  const viewConfig = useMemo(
    () => getRegisterViewConfig(schema, items, isExternalView),
    [schema, items, isExternalView]
  );

  useEffect(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setOwnerFilter('all');
    setCategoryFilter('all');
    setSortKey(viewConfig.defaultSort);
    setHeaderMenu(null);
  }, [registerType, viewConfig.defaultSort]);

  const filteredItems = useMemo(() => applyRegisterView({
    items,
    searchQuery,
    isExternalView,
    statusFilter,
    ownerFilter,
    categoryFilter,
    sortKey,
    config: viewConfig
  }), [
    items,
    searchQuery,
    isExternalView,
    statusFilter,
    ownerFilter,
    categoryFilter,
    sortKey,
    viewConfig
  ]);

  const handleCellEdit = (itemId, key, value) => {
    onUpdateItem(registerType, itemId, key, value);
    setEditingCell(null);
  };

  const closePopover = useCallback(() => setExpandedCell(null), []);

  if (isMobile) {
    return (
      <MobileRegisterList
        schema={schema}
        items={items}
        isExternalView={isExternalView}
        onUpdateItem={(itemId, key, value) => onUpdateItem(registerType, itemId, key, value)}
        onDeleteItem={(itemId) => onDeleteItem(registerType, itemId)}
      />
    );
  }

  const getHeaderSortValue = (col) => {
    if (col === 'Number') {
      return sortKey === 'numberAsc' || sortKey === 'numberDesc' ? sortKey : 'default';
    }
    if (col === viewConfig.dateColumn) {
      return sortKey === 'dateAsc' || sortKey === 'dateDesc' ? sortKey : 'default';
    }
    if (col === viewConfig.statusColumn) {
      return sortKey === 'statusAsc' || sortKey === 'statusDesc' ? sortKey : 'default';
    }
    if (col === viewConfig.ownerColumn) {
      return sortKey === 'ownerAsc' || sortKey === 'ownerDesc' ? sortKey : 'default';
    }
    if (col === viewConfig.categoryColumn) {
      return sortKey === 'categoryAsc' || sortKey === 'categoryDesc' ? sortKey : 'default';
    }
    return 'default';
  };

  const getHeaderMenuConfig = (col) => {
    if (col === viewConfig.statusColumn) {
      return {
        sortValue: getHeaderSortValue(col),
        sortOptions: [
          { value: 'default', label: 'Default' },
          { value: 'statusAsc', label: 'A to Z' },
          { value: 'statusDesc', label: 'Z to A' }
        ],
        filterValue: statusFilter,
        filterOptions: viewConfig.statusOptions,
        filterLabel: 'Filter status',
        onFilterChange: setStatusFilter
      };
    }

    if (col === viewConfig.ownerColumn) {
      return {
        sortValue: getHeaderSortValue(col),
        sortOptions: [
          { value: 'default', label: 'Default' },
          { value: 'ownerAsc', label: 'A to Z' },
          { value: 'ownerDesc', label: 'Z to A' }
        ],
        filterValue: ownerFilter,
        filterOptions: viewConfig.ownerOptions,
        filterLabel: 'Filter owner',
        onFilterChange: setOwnerFilter
      };
    }

    if (col === viewConfig.categoryColumn) {
      return {
        sortValue: getHeaderSortValue(col),
        sortOptions: [
          { value: 'default', label: 'Default' },
          { value: 'categoryAsc', label: 'A to Z' },
          { value: 'categoryDesc', label: 'Z to A' }
        ],
        filterValue: categoryFilter,
        filterOptions: viewConfig.categoryOptions,
        filterLabel: 'Filter category',
        onFilterChange: setCategoryFilter
      };
    }

    if (col === viewConfig.dateColumn) {
      return {
        sortValue: getHeaderSortValue(col),
        sortOptions: [
          { value: 'default', label: 'Default' },
          { value: 'dateAsc', label: 'Soonest first' },
          { value: 'dateDesc', label: 'Latest first' }
        ],
        filterOptions: []
      };
    }

    if (col === 'Number') {
      return {
        sortValue: getHeaderSortValue(col),
        sortOptions: [
          { value: 'default', label: 'Default' },
          { value: 'numberAsc', label: 'Smallest first' },
          { value: 'numberDesc', label: 'Largest first' }
        ],
        filterOptions: []
      };
    }

    return null;
  };

  const isHeaderActive = (col) => {
    if (col === viewConfig.statusColumn) {
      return statusFilter !== 'all' || getHeaderSortValue(col) !== 'default';
    }
    if (col === viewConfig.ownerColumn) {
      return ownerFilter !== 'all' || getHeaderSortValue(col) !== 'default';
    }
    if (col === viewConfig.categoryColumn) {
      return categoryFilter !== 'all' || getHeaderSortValue(col) !== 'default';
    }
    if (col === 'Number' || col === viewConfig.dateColumn) {
      return getHeaderSortValue(col) !== 'default';
    }
    return false;
  };

  const toggleHeaderMenu = (col, event) => {
    const config = getHeaderMenuConfig(col);
    if (!config) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setHeaderMenu((current) => (
      current?.col === col ? null : { col, anchorRect: rect }
    ));
  };

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
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 rounded-t-xl">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">
                  {schema.title}
                </h2>
                <div className="text-[11px] text-slate-400">
                  {filteredItems.length} matching item{filteredItems.length !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] border border-slate-200 rounded-lg min-w-[180px] outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                />
              </div>
            </div>
          </div>
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
                      col === 'Number' ? 'w-24 text-center' : 
                      col === viewConfig.statusColumn || col === 'Level' || col === 'Complete' ? 'w-32' :
                      col === viewConfig.dateColumn || col === 'Completed' || col === 'Date' || col === 'Updated' ? 'w-36' :
                      col === viewConfig.ownerColumn || col === viewConfig.categoryColumn || col === 'Owner' || col === 'Category' ? 'w-40' :
                      ''
                    }`}
                  >
                    {col === 'Visible' ? (
                      <IconEyeOpen />
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{col}</span>
                        {getHeaderMenuConfig(col) ? (
                          <button
                            type="button"
                            onClick={(event) => toggleHeaderMenu(col, event)}
                            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                              isHeaderActive(col)
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                                : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                            }`}
                            title={`${col} options`}
                          >
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                              <path d="M3 5h10L9 10v3l-2-1V10L3 5z" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
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

      {headerMenu && getHeaderMenuConfig(headerMenu.col) && (
        <HeaderMenuPopover
          anchorRect={headerMenu.anchorRect}
          title={headerMenu.col}
          {...getHeaderMenuConfig(headerMenu.col)}
          onSortChange={setSortKey}
          onClose={() => setHeaderMenu(null)}
        />
      )}
    </div>
  );
};

export default React.memo(RegisterView);
