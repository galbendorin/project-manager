import React, { useState, useEffect, useMemo } from 'react';
import { SCHEMAS } from '../utils/constants';
import { applyRegisterView, getRegisterViewConfig } from '../utils/registerViewUtils';
import { IconEyeOpen, IconTrash } from './Icons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MobileRegisterList from './mobile/MobileRegisterList';
import RowColorControl from './RowColorControl';
import { getRowColorBackground } from '../utils/rowColors';
import RegisterEditableCell from './RegisterEditableCell';
import RegisterHeaderMenuPopover from './RegisterHeaderMenuPopover';

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
  const [columnFilters, setColumnFilters] = useState({});
  const [sortKey, setSortKey] = useState('default');
  const [headerMenu, setHeaderMenu] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [expandedCell, setExpandedCell] = useState(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const schema = SCHEMAS[registerType];
  const safeSchema = schema || { cols: [] };
  const allowRowColor = registerType === 'actions';

  const visibleCols = isExternalView 
    ? safeSchema.cols.filter(c => c !== "Visible") 
    : safeSchema.cols;

  const viewConfig = useMemo(
    () => (schema ? getRegisterViewConfig(schema, items, isExternalView) : {
      filterColumns: [],
      defaultFilters: {},
      defaultSort: 'default',
      sortOptionsByColumn: {},
      filterOptionsByColumn: {},
    }),
    [schema, items, isExternalView]
  );
  const filterColumnsKey = viewConfig.filterColumns.join('|');

  useEffect(() => {
    setSearchQuery('');
    setColumnFilters(viewConfig.defaultFilters);
    setSortKey(viewConfig.defaultSort);
    setHeaderMenu(null);
  }, [registerType, filterColumnsKey, viewConfig.defaultFilters, viewConfig.defaultSort]);

  const filteredItems = useMemo(() => applyRegisterView({
    items,
    searchQuery,
    isExternalView,
    columnFilters,
    sortKey,
    config: viewConfig
  }), [
    items,
    searchQuery,
    isExternalView,
    columnFilters,
    sortKey,
    viewConfig
  ]);

  const handleCellEdit = (itemId, key, value) => {
    onUpdateItem(registerType, itemId, key, value);
    setEditingCell(null);
  };

  if (!schema) return null;

  if (isMobile) {
    return (
      <MobileRegisterList
        schema={schema}
        items={items}
        isExternalView={isExternalView}
        allowRowColor={allowRowColor}
        onUpdateItem={(itemId, key, value) => onUpdateItem(registerType, itemId, key, value)}
        onDeleteItem={(itemId) => onDeleteItem(registerType, itemId)}
      />
    );
  }

  const getHeaderSortValue = (col) => {
    const sortOptions = viewConfig.sortOptionsByColumn?.[col] || [];
    if (sortOptions.some((option) => option.value === sortKey)) return sortKey;
    return 'default';
  };

  const getHeaderMenuConfig = (col) => {
    const sortOptions = viewConfig.sortOptionsByColumn?.[col] || [];
    const filterOptions = viewConfig.filterOptionsByColumn?.[col] || [];
    if (sortOptions.length === 0 && filterOptions.length === 0) return null;

    return {
      sortValue: getHeaderSortValue(col),
      sortOptions: sortOptions.length > 0
        ? [{ value: 'default', label: 'Default' }, ...sortOptions]
        : [],
      filterValue: columnFilters[col] || 'all',
      filterOptions,
      filterLabel: `Filter ${col.toLowerCase()}`,
      onFilterChange: (value) => setColumnFilters((current) => ({ ...current, [col]: value }))
    };
  };

  const isHeaderActive = (col) => {
    return (columnFilters[col] || 'all') !== 'all' || getHeaderSortValue(col) !== 'default';
  };

  const toggleHeaderMenu = (col, event) => {
    const config = getHeaderMenuConfig(col);
    if (!config) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setHeaderMenu((current) => (
      current?.col === col ? null : { col, anchorRect: rect }
    ));
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
                <th className={`px-3 py-3 border-b text-center ${allowRowColor ? 'w-24' : 'w-12'}`}>
                  {allowRowColor ? 'Color' : <IconTrash />}
                </th>
              </tr>
            </thead>
            <tbody className="text-[12px] text-slate-700">
              {filteredItems.map(item => (
                <tr
                  key={item._id}
                  className={`group border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${
                    !item.public && !item.rowColor ? 'bg-slate-50/50' : ''
                  }`}
                  style={item.rowColor ? { backgroundColor: getRowColorBackground(item.rowColor) } : undefined}
                >
                  {visibleCols.map(col => (
                    <RegisterEditableCell
                      key={col}
                      item={item}
                      colName={col}
                      registerType={registerType}
                      editingCell={editingCell}
                      expandedCell={expandedCell}
                      onSetEditingCell={setEditingCell}
                      onSetExpandedCell={setExpandedCell}
                      onCommitCell={handleCellEdit}
                      onTogglePublic={onTogglePublic}
                    />
                  ))}
                  <td className={`px-3 py-2.5 text-center ${allowRowColor ? 'w-24' : 'w-12'}`}>
                    <div className="flex items-center justify-center gap-2">
                      {allowRowColor && (
                        <RowColorControl
                          value={item.rowColor || null}
                          onChange={(nextColor) => onUpdateItem(registerType, item._id, 'rowColor', nextColor)}
                          className="opacity-75 transition group-hover:opacity-100"
                        />
                      )}
                      <button
                        onClick={() => onDeleteItem(registerType, item._id)}
                        className="text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <IconTrash />
                      </button>
                    </div>
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
        <RegisterHeaderMenuPopover
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
