import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { keyGen } from '../../utils/helpers';
import { applyRegisterView, getRegisterFieldValue, getRegisterViewConfig } from '../../utils/registerViewUtils';

const TITLE_SKIP_COLUMNS = new Set([
  'Visible',
  'Number',
  'Status',
  'Current Status',
  'Level',
  'Category',
  'Raised',
  'Target',
  'Update',
  'Updated',
  'Completed',
  'Complete',
  'Date',
  'Date Raised',
  'Billing',
]);

const OWNER_COLUMNS = [
  'Owner',
  'Action Assigned to',
  'Issue Assigned to',
  'Assigned to',
  'Name',
  'Audience',
];

const DATE_COLUMNS = [
  'Target',
  'Completed',
  'Updated',
  'Date',
  'Date Raised',
  'Raised',
];

const ALWAYS_VISIBLE_COLUMNS = ['Number', 'Status', 'Current Status', 'Level'];

const STATUS_OPTIONS = [
  'Open',
  'In Progress',
  'Monitor',
  'On Hold',
  'Completed',
  'Closed',
  'Cancelled',
];

const LEVEL_OPTIONS = ['High', 'Medium', 'Low'];

const getColumnValue = (item, column) => getRegisterFieldValue(item, column);

const hasValue = (value) => String(value ?? '').trim().length > 0;

const badgeTone = (value, type) => {
  const normalized = String(value || '').toLowerCase();

  if (type === 'level') {
    if (normalized.includes('high') || normalized.includes('red')) return 'bg-rose-50 text-rose-700 border-rose-100';
    if (normalized.includes('med') || normalized.includes('amber')) return 'bg-amber-50 text-amber-700 border-amber-100';
    if (normalized.includes('low') || normalized.includes('green')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  }

  if (normalized.includes('closed') || normalized.includes('complete') || normalized.includes('done')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  }
  if (normalized.includes('hold') || normalized.includes('monitor')) {
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }
  if (normalized.includes('critical') || normalized.includes('overdue') || normalized.includes('cancel')) {
    return 'bg-rose-50 text-rose-700 border-rose-100';
  }
  if (normalized.includes('open') || normalized.includes('progress')) {
    return 'bg-sky-50 text-sky-700 border-sky-100';
  }

  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const RegisterDetailSheet = ({ item, schema, onClose, onDeleteItem, onUpdateItem }) => {
  const [editingColumn, setEditingColumn] = useState(null);
  const [draftValue, setDraftValue] = useState('');
  const [showEmptyFields, setShowEmptyFields] = useState(false);

  const handleSave = useCallback((column) => {
    const key = keyGen(column);
    onUpdateItem(item._id || item.id, key, draftValue);
    setEditingColumn(null);
  }, [draftValue, item, onUpdateItem]);

  const visibleColumns = useMemo(
    () => schema.cols.filter((column) => column !== 'Visible'),
    [schema.cols]
  );

  const filledColumns = useMemo(
    () => visibleColumns.filter((column) => hasValue(getColumnValue(item, column))),
    [item, visibleColumns]
  );

  const summaryColumns = useMemo(
    () => ALWAYS_VISIBLE_COLUMNS.filter((column) => filledColumns.includes(column)),
    [filledColumns]
  );

  const detailColumns = useMemo(
    () => visibleColumns.filter((column) => !ALWAYS_VISIBLE_COLUMNS.includes(column) && filledColumns.includes(column)),
    [filledColumns, visibleColumns]
  );

  const emptyColumns = useMemo(
    () => visibleColumns.filter((column) => !filledColumns.includes(column)),
    [filledColumns, visibleColumns]
  );

  const meaningfulTitleColumn = useMemo(
    () => visibleColumns.find((column) => {
      if (TITLE_SKIP_COLUMNS.has(column) || OWNER_COLUMNS.includes(column) || DATE_COLUMNS.includes(column)) return false;
      return hasValue(getColumnValue(item, column));
    }),
    [item, visibleColumns]
  );

  const titleValue = meaningfulTitleColumn ? getColumnValue(item, meaningfulTitleColumn) : '';
  const ownerValue = OWNER_COLUMNS.map((column) => getColumnValue(item, column)).find(hasValue);
  const dateValue = DATE_COLUMNS.map((column) => getColumnValue(item, column)).find(hasValue);

  const renderField = (column) => {
    const value = getColumnValue(item, column);
    const isEditing = editingColumn === column;
    const isStatusField = column === 'Status' || column === 'Current Status';
    const isLevelField = column === 'Level';
    const options = isStatusField ? STATUS_OPTIONS : isLevelField ? LEVEL_OPTIONS : null;
    const empty = !hasValue(value);

    return (
      <div key={column} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {column}
        </div>

        {isEditing && options ? (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={option}
                onClick={() => {
                  setDraftValue(option);
                  onUpdateItem(item._id || item.id, keyGen(column), option);
                  setEditingColumn(null);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  String(value) === option
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        ) : isEditing ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              rows={Math.max(3, String(value || '').length > 80 ? 5 : 3)}
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSave(column)}
                className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Save
              </button>
              <button
                onClick={() => setEditingColumn(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setEditingColumn(column);
              setDraftValue(String(value || ''));
            }}
            className={`w-full rounded-2xl border px-3 py-3 text-left text-sm ${
              empty
                ? 'border-dashed border-slate-300 bg-white text-slate-400'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            {empty ? 'Add details' : String(value)}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col">
      <div className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
      <div className="relative mt-12 flex-1 overflow-hidden rounded-t-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <button onClick={onClose} className="text-sm font-semibold text-indigo-600">
            Back
          </button>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {schema.title}
          </div>
          <button
            onClick={() => {
              if (window.confirm('Delete this item?')) {
                onDeleteItem(item._id || item.id);
                onClose();
              }
            }}
            className="text-sm font-semibold text-rose-500"
          >
            Delete
          </button>
        </div>

        <div className="h-full overflow-y-auto pb-16">
          <div className="space-y-4 px-4 py-4">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {summaryColumns.map((column) => {
                  const value = getColumnValue(item, column);
                  const tone = column === 'Level' ? badgeTone(value, 'level') : badgeTone(value, 'status');
                  return (
                    <span key={column} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone}`}>
                      {value}
                    </span>
                  );
                })}
              </div>

              <div className="mt-3 text-base font-semibold leading-6 text-slate-900">
                {titleValue || `${schema.title} entry`}
              </div>

              {(ownerValue || dateValue) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {ownerValue && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      {ownerValue}
                    </span>
                  )}
                  {dateValue && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                      {dateValue}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
              {detailColumns.length > 0 ? (
                detailColumns.map(renderField)
              ) : (
                <div className="px-4 py-5 text-sm text-slate-500">
                  Only the headline fields are filled in so far. Add more details below when you need them.
                </div>
              )}
            </div>

            {emptyColumns.length > 0 && (
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                <button
                  onClick={() => setShowEmptyFields((current) => !current)}
                  className="flex w-full items-center justify-between px-4 py-4 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {showEmptyFields ? 'Hide extra fields' : `Add more details (${emptyColumns.length})`}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Keep the screen focused until you need the rest of the form.
                    </div>
                  </div>
                  <span className="text-xl text-slate-300">{showEmptyFields ? '−' : '+'}</span>
                </button>

                {showEmptyFields && emptyColumns.map(renderField)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MobileRegisterCard = ({ item, schema, onOpen }) => {
  const titleColumn = schema.cols.find((column) => {
    if (TITLE_SKIP_COLUMNS.has(column) || OWNER_COLUMNS.includes(column) || DATE_COLUMNS.includes(column)) return false;
    return hasValue(getColumnValue(item, column));
  });

  const title = titleColumn ? getColumnValue(item, titleColumn) : `${schema.title} entry`;
  const number = getColumnValue(item, 'Number');
  const level = getColumnValue(item, 'Level');
  const status = getColumnValue(item, 'Status') || getColumnValue(item, 'Current Status');
  const owner = OWNER_COLUMNS.map((column) => getColumnValue(item, column)).find(Boolean);
  const dateValue = DATE_COLUMNS.map((column) => getColumnValue(item, column)).find(Boolean);

  const detailColumn = schema.cols.find((column) => {
    if (column === titleColumn || TITLE_SKIP_COLUMNS.has(column)) return false;
    return hasValue(getColumnValue(item, column));
  });
  const detail = detailColumn ? getColumnValue(item, detailColumn) : '';

  return (
    <button
      onClick={() => onOpen(item)}
      className="w-full rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {number !== '' && number !== null && (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {number}
              </span>
            )}
            {level && (
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeTone(level, 'level')}`}>
                {level}
              </span>
            )}
            {status && (
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${badgeTone(status, 'status')}`}>
                {status}
              </span>
            )}
          </div>

          <div className="mt-3 text-base font-semibold leading-6 text-slate-900">
            {String(title || '').trim() || 'Untitled item'}
          </div>

          {detail && (
            <div className="mt-2 text-sm leading-6 text-slate-500">
              {detail}
            </div>
          )}

          {(owner || dateValue) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {owner && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {owner}
                </span>
              )}
              {dateValue && (
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                  {dateValue}
                </span>
              )}
            </div>
          )}
        </div>

        <span className="pt-1 text-slate-300">›</span>
      </div>
    </button>
  );
};

const MobileRegisterList = ({
  schema,
  items,
  isExternalView,
  onUpdateItem,
  onDeleteItem,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState('default');
  const [selectedItem, setSelectedItem] = useState(null);

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
    setSelectedItem(null);
  }, [schema.title, viewConfig.defaultSort]);

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

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">{schema.title}</div>
            <div className="mt-1 text-xs text-slate-400">
              {filteredItems.length} visible item{filteredItems.length !== 1 ? 's' : ''}
            </div>
          </div>
          {isExternalView && (
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              Public only
            </div>
          )}
        </div>

        <input
          type="text"
          placeholder={`Search ${schema.title.toLowerCase()}...`}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
        />

        <div className="mt-3 space-y-3">
          {viewConfig.statusColumn && (
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
            >
              <option value="all">All status</option>
              {viewConfig.statusOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          )}

          {viewConfig.ownerColumn && (
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
            >
              <option value="all">All owners</option>
              {viewConfig.ownerOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          )}

          {viewConfig.categoryColumn && (
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
            >
              <option value="all">All categories</option>
              {viewConfig.categoryOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          )}

          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
          >
            {viewConfig.sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {filteredItems.length > 0 ? (
          <div className="space-y-3">
            {filteredItems.map((item, index) => (
              <MobileRegisterCard
                key={item._id || item.id || `${schema.title}-${index}`}
                item={item}
                schema={schema}
                onOpen={setSelectedItem}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400">
            No entries match this view.
          </div>
        )}
      </div>

      {selectedItem && (
        <RegisterDetailSheet
          item={selectedItem}
          schema={schema}
          onClose={() => setSelectedItem(null)}
          onDeleteItem={onDeleteItem}
          onUpdateItem={(itemId, key, value) => {
            onUpdateItem(itemId, key, value);
            setSelectedItem((current) => (
              current && (current._id || current.id) === itemId
                ? { ...current, [key]: value }
                : current
            ));
          }}
        />
      )}
    </div>
  );
};

export default React.memo(MobileRegisterList);
