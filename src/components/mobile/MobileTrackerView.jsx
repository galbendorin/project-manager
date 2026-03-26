import React, { useMemo, useState } from 'react';
import { filterBySearch } from '../../utils/helpers';
import RowColorControl from '../RowColorControl';
import { getRowColorSurfaceStyle } from '../../utils/rowColors';

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
const RAG_OPTIONS = ['Green', 'Amber', 'Red'];

const RAG_COLORS = {
  Green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
  Amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
  Red: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100' },
};

const STATUS_COLORS = {
  'Not Started': 'bg-slate-100 text-slate-600 border-slate-200',
  'In Progress': 'bg-sky-50 text-sky-700 border-sky-100',
  'On Hold': 'bg-amber-50 text-amber-700 border-amber-100',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-100',
};

const getTaskProgress = (tasks, taskId) => {
  const task = tasks.find((entry) => entry.id === taskId);
  return task ? task.pct : null;
};

const clampStyle = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const MobileTrackerCard = ({ item, progress, onOpen }) => {
  const ragTone = RAG_COLORS[item.rag] || RAG_COLORS.Green;
  const statusTone = STATUS_COLORS[item.status] || STATUS_COLORS['Not Started'];
  const summaryText = item.notes || item.nextAction || '';

  return (
    <button
      onClick={() => onOpen(item)}
      className="w-full rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.99]"
      style={getRowColorSurfaceStyle(item.rowColor) || undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${ragTone.bg} ${ragTone.text} ${ragTone.border}`}>
          {item.rag || 'Green'}
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone}`}>
          {item.status || 'Not Started'}
        </span>
        {!item.taskId && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
            Manual
          </span>
        )}
      </div>

      <div className="mt-3 text-base font-semibold leading-6 text-slate-900">
        {item.taskName || 'New item'}
      </div>

      {summaryText ? (
        <div className="mt-2 text-sm leading-6 text-slate-500" style={clampStyle}>
          {summaryText}
        </div>
      ) : (
        <div className="mt-2 text-sm leading-6 text-slate-400">
          Add notes or a next action to make this tracker item clearer.
        </div>
      )}

      {progress !== null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Task progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200">
            <div
              className={`h-2 rounded-full ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.owner && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {item.owner}
          </span>
        )}
        {item.lastUpdated && (
          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
            Updated {item.lastUpdated}
          </span>
        )}
      </div>
    </button>
  );
};

const TrackerDetailSheet = ({
  item,
  trackerItems,
  tasks,
  onClose,
  onRemoveItem,
  onUpdateItem,
  onReorderItems,
  onNavigateToSchedule,
  onPatchCurrent,
}) => {
  const progress = getTaskProgress(tasks, item.taskId);
  const isManual = !item.taskId;
  const ragTone = RAG_COLORS[item.rag] || RAG_COLORS.Green;
  const statusTone = STATUS_COLORS[item.status] || STATUS_COLORS['Not Started'];

  const applyUpdate = (key, value) => {
    onUpdateItem(item._id, key, value);
    onPatchCurrent(key, value);
  };

  const trackerIndex = trackerItems.findIndex((entry) => entry._id === item._id);
  const previousItem = trackerIndex > 0 ? trackerItems[trackerIndex - 1] : null;
  const nextItem = trackerIndex >= 0 && trackerIndex < trackerItems.length - 1
    ? trackerItems[trackerIndex + 1]
    : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col">
      <div className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
      <div className="relative mt-12 flex-1 overflow-hidden rounded-t-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <button onClick={onClose} className="text-sm font-semibold text-indigo-600">
            Back
          </button>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Master Tracker
          </div>
          <button
            onClick={() => {
              if (window.confirm('Delete this tracker item?')) {
                onRemoveItem(item._id);
                onClose();
              }
            }}
            className="text-sm font-semibold text-rose-500"
          >
            Delete
          </button>
        </div>

        <div className="h-full overflow-y-auto px-4 pb-16 pt-4">
          <div
            className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
            style={getRowColorSurfaceStyle(item.rowColor) || undefined}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${ragTone.bg} ${ragTone.text} ${ragTone.border}`}>
                {item.rag || 'Green'}
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone}`}>
                {item.status || 'Not Started'}
              </span>
              {!item.taskId && (
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  Manual item
                </span>
              )}
            </div>

            {isManual ? (
              <input
                type="text"
                defaultValue={item.taskName || ''}
                placeholder="Item name"
                onBlur={(event) => applyUpdate('taskName', event.target.value || 'New Item')}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:border-indigo-300"
              />
            ) : (
              <div className="mt-3">
                <div className="text-base font-semibold leading-6 text-slate-900">
                  {item.taskName || 'Tracked task'}
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToSchedule?.(item.taskId);
                  }}
                  className="mt-2 text-sm font-semibold text-indigo-600"
                >
                  Open in Project Plan
                </button>
              </div>
            )}

            {progress !== null && (
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
                  <span>Task progress</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full ${progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Order
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => previousItem && onReorderItems?.(item._id, previousItem._id)}
                  disabled={!previousItem}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
                >
                  Move up
                </button>
                <button
                  type="button"
                  onClick={() => nextItem && onReorderItems?.(item._id, nextItem._id)}
                  disabled={!nextItem}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
                >
                  Move down
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Row color
              </div>
              <div className="mt-3">
                <RowColorControl
                  value={item.rowColor || null}
                  onChange={(nextColor) => applyUpdate('rowColor', nextColor)}
                  mode="pills"
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Status
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option}
                    onClick={() => applyUpdate('status', option)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      (item.status || 'Not Started') === option
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                RAG
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {RAG_OPTIONS.map((option) => (
                  <button
                    key={option}
                    onClick={() => applyUpdate('rag', option)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      (item.rag || 'Green') === option
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Owner
              </div>
              <input
                type="text"
                defaultValue={item.owner || ''}
                placeholder="Assign an owner"
                onBlur={(event) => applyUpdate('owner', event.target.value)}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
              />
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Next Action
              </div>
              <textarea
                defaultValue={item.nextAction || ''}
                placeholder="Capture the next step"
                rows={4}
                onBlur={(event) => applyUpdate('nextAction', event.target.value)}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
              />
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Notes
              </div>
              <textarea
                defaultValue={item.notes || ''}
                placeholder="Add the current tracker note"
                rows={5}
                onBlur={(event) => applyUpdate('notes', event.target.value)}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
              />
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Tracker Dates
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Date Added</div>
                  <div className="mt-1 text-sm text-slate-700">{item.dateAdded || 'Not set'}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Last Updated</div>
                  <div className="mt-1 text-sm text-slate-700">{item.lastUpdated || 'Not set'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, tone = 'text-slate-800' }) => (
  <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</div>
    <div className={`mt-2 text-3xl font-black ${tone}`}>{value}</div>
  </div>
);

const MobileTrackerView = ({
  trackerItems,
  tasks,
  onUpdateItem,
  onRemoveItem,
  onAddManualItem,
  onReorderItems,
  onNavigateToSchedule,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);

  const filteredItems = useMemo(() => {
    let items = trackerItems;
    if (filterStatus !== 'all') {
      items = items.filter((item) => item.status === filterStatus);
    }
    if (searchQuery) {
      items = filterBySearch(items, searchQuery);
    }
    return items;
  }, [trackerItems, filterStatus, searchQuery]);

  const stats = useMemo(() => {
    const total = trackerItems.length;
    const completed = trackerItems.filter((item) => item.status === 'Completed').length;
    const inProgress = trackerItems.filter((item) => item.status === 'In Progress').length;
    const redItems = trackerItems.filter((item) => item.rag === 'Red').length;
    const amberItems = trackerItems.filter((item) => item.rag === 'Amber').length;
    return { total, completed, inProgress, redItems, amberItems };
  }, [trackerItems]);

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Tracked" value={stats.total} />
            <StatCard label="In Progress" value={stats.inProgress} tone="text-blue-600" />
            <StatCard label="Completed" value={stats.completed} tone="text-emerald-600" />
            <StatCard label="Amber" value={stats.amberItems} tone="text-amber-600" />
            <div className="col-span-2">
              <StatCard label="Red" value={stats.redItems} tone="text-rose-600" />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-4">
              <div className="text-lg font-semibold text-slate-900">Project Master Tracker</div>
              <div className="mt-1 text-sm text-slate-400">
                Track the small set of items that need close delivery control.
              </div>

              <div className="mt-4 space-y-3">
                <button
                  onClick={() => onAddManualItem?.()}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white"
                >
                  + Add Item
                </button>

                <select
                  value={filterStatus}
                  onChange={(event) => setFilterStatus(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
                >
                  <option value="all">All Status</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder="Search tracker..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:bg-white"
                />
              </div>
            </div>

            <div className="px-3 py-3">
              {filteredItems.length > 0 ? (
                <div className="space-y-3">
                  {filteredItems.map((item) => (
                    <MobileTrackerCard
                      key={item._id}
                      item={item}
                      progress={getTaskProgress(tasks, item.taskId)}
                      onOpen={setSelectedItem}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400">
                  {trackerItems.length === 0
                    ? 'No tasks are in the tracker yet.'
                    : 'No tracker items match this filter.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedItem && (
        <TrackerDetailSheet
          item={selectedItem}
          trackerItems={trackerItems}
          tasks={tasks}
          onClose={() => setSelectedItem(null)}
          onRemoveItem={onRemoveItem}
          onUpdateItem={onUpdateItem}
          onReorderItems={onReorderItems}
          onNavigateToSchedule={onNavigateToSchedule}
          onPatchCurrent={(key, value) => {
            setSelectedItem((current) => (
              current
                ? { ...current, [key]: value }
                : current
            ));
          }}
        />
      )}
    </div>
  );
};

export default React.memo(MobileTrackerView);
