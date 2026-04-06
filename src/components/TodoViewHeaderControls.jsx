import React from 'react';
import TodoMultiSelectFilter from './TodoMultiSelectFilter';

const MobileField = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
    {children}
  </label>
);

export default function TodoViewHeaderControls({
  activeFilterCount,
  bucketFilter,
  bucketOptions,
  clearAllFilters,
  futureItemCount,
  futureMonthCount,
  isMobile,
  loadingAllProjects,
  ownerFilter,
  ownerOptions,
  projectFilter,
  projectSelectOptions,
  recurrenceFilter,
  recurrenceOptions,
  scope,
  searchQuery,
  setBucketFilter,
  setOwnerFilter,
  setProjectFilter,
  setRecurrenceFilter,
  setScope,
  setSearchQuery,
  setShowFutureMonths,
  setShowMobileFilters,
  setSourceFilter,
  setViewMode,
  showFutureMonths,
  showMobileFilters,
  sourceFilter,
  sourceOptions,
  viewMode,
  visibleOpenTodos,
}) {
  const futureToggleLabel = showFutureMonths
    ? 'Hide next 12 months'
    : futureMonthCount > 0
      ? `Show next 12 months (${futureMonthCount})`
      : 'Show next 12 months';

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-slate-200 rounded-t-xl space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 tracking-tight">Tasks</h2>
          <p className="text-[11px] text-slate-400 mt-1">
            Scope-aware task view with manual + derived items, project filters, and recurring rules.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'list'
                  ? 'bg-[var(--pm-accent)] text-white shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'board'
                  ? 'bg-[var(--pm-accent)] text-white shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              Board
            </button>
          </div>
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-base sm:text-[12px] border border-slate-200 rounded-lg w-full sm:w-64 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          />
          {futureMonthCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowFutureMonths((value) => !value)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                showFutureMonths
                  ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)]'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {futureToggleLabel}
            </button>
          ) : null}
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-slate-500">
                {visibleOpenTodos.length} active item{visibleOpenTodos.length !== 1 ? 's' : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileFilters(true)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                showMobileFilters || activeFilterCount > 0
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              {scope === 'project' ? 'This project + Other' : 'All projects + Other'}
            </span>
            {activeFilterCount > 0 ? (
              <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700">
                {activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}
              </span>
            ) : null}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600"
              >
                Clear
              </button>
            ) : null}
            {futureMonthCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowFutureMonths((value) => !value)}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  showFutureMonths
                    ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)]'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {showFutureMonths ? 'Hide next 12 months' : `Show next 12 months (${futureMonthCount})`}
              </button>
            ) : null}
          </div>

          {!showFutureMonths && futureItemCount > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
              {futureItemCount} task{futureItemCount !== 1 ? 's' : ''} scheduled across the next {futureMonthCount} month{futureMonthCount !== 1 ? 's' : ''} are hidden.
            </div>
          ) : null}

          {showMobileFilters ? (
            <div className="fixed inset-0 z-[70] flex flex-col sm:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-slate-950/45"
                onClick={() => setShowMobileFilters(false)}
                aria-label="Close filters"
              />
              <div className="relative mt-16 flex-1 overflow-hidden rounded-t-[28px] bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Task filters</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      Keep the list clear until you need to refine it.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMobileFilters(false)}
                    className="text-sm font-semibold text-indigo-600"
                  >
                    Done
                  </button>
                </div>

                <div className="h-full overflow-y-auto px-4 py-4 pb-16 space-y-3">
                  <MobileField label="Scope">
                    <select
                      value={scope}
                      onChange={(e) => {
                        const nextScope = e.target.value;
                        setScope(nextScope);
                        setProjectFilter([]);
                      }}
                      className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white w-full"
                    >
                      <option value="project">This Project + Other</option>
                      <option value="all">All Projects + Other</option>
                    </select>
                  </MobileField>

                  <TodoMultiSelectFilter
                    allLabel={scope === 'project' ? 'In Scope (This Project + Other)' : 'All Projects + Other'}
                    options={projectSelectOptions}
                    selectedValues={projectFilter}
                    onChange={setProjectFilter}
                  />

                  <TodoMultiSelectFilter
                    allLabel="All Sources"
                    options={sourceOptions}
                    selectedValues={sourceFilter}
                    onChange={setSourceFilter}
                  />

                  <TodoMultiSelectFilter
                    allLabel="All Owners"
                    options={ownerOptions}
                    selectedValues={ownerFilter}
                    onChange={setOwnerFilter}
                  />

                  <TodoMultiSelectFilter
                    allLabel="All Recurrence"
                    options={recurrenceOptions}
                    selectedValues={recurrenceFilter}
                    onChange={setRecurrenceFilter}
                  />

                  <TodoMultiSelectFilter
                    allLabel="All Buckets"
                    options={bucketOptions}
                    selectedValues={bucketFilter}
                    onChange={setBucketFilter}
                  />

                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-600"
                    >
                      Clear all filters
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2.5">
          {!showFutureMonths && futureItemCount > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
              {futureItemCount} task{futureItemCount !== 1 ? 's' : ''} scheduled across the next {futureMonthCount} month{futureMonthCount !== 1 ? 's' : ''} are hidden.
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <select
            value={scope}
            onChange={(e) => {
              const nextScope = e.target.value;
              setScope(nextScope);
              setProjectFilter([]);
            }}
            className="px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg bg-white"
          >
            <option value="project">This Project + Other</option>
            <option value="all">All Projects + Other</option>
          </select>

          <TodoMultiSelectFilter
            allLabel={scope === 'project' ? 'In Scope (This Project + Other)' : 'All Projects + Other'}
            options={projectSelectOptions}
            selectedValues={projectFilter}
            onChange={setProjectFilter}
          />

          <TodoMultiSelectFilter
            allLabel="All Sources"
            options={sourceOptions}
            selectedValues={sourceFilter}
            onChange={setSourceFilter}
          />

          <TodoMultiSelectFilter
            allLabel="All Owners"
            options={ownerOptions}
            selectedValues={ownerFilter}
            onChange={setOwnerFilter}
          />

          <TodoMultiSelectFilter
            allLabel="All Recurrence"
            options={recurrenceOptions}
            selectedValues={recurrenceFilter}
            onChange={setRecurrenceFilter}
          />

          <TodoMultiSelectFilter
            allLabel="All Buckets"
            options={bucketOptions}
            selectedValues={bucketFilter}
            onChange={setBucketFilter}
          />
          </div>
        </div>
      )}

      {scope === 'all' && loadingAllProjects && (
        <div className="text-[11px] text-slate-400">Loading all-project derived tasks...</div>
      )}
    </div>
  );
}
