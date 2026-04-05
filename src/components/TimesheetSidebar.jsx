import React from 'react';
import {
  formatDurationMinutes,
  formatHoursFromMinutes,
  formatWeekRange,
  getTrackProjectColor,
} from '../utils/timesheets';

export default function TimesheetSidebar({
  activeEntry,
  currentProject,
  currentUserId,
  getEntryProjectLabel,
  offlineQueueCount,
  offlineStatusLabel,
  onBackToProject,
  onNextWeek,
  onPreviousWeek,
  onSelectProject,
  onThisWeek,
  onViewModeChange,
  recentProjects,
  sectionLabelClass,
  selectedProject,
  selectedProjectId,
  totalMinutes,
  viewMode,
  visibleEntries,
  weekStart,
}) {
  return (
    <aside className="pm-home-panel rounded-[26px] px-4 py-4 text-slate-900 sm:rounded-[30px] sm:px-5 sm:py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={sectionLabelClass}>Timesheet</p>
          <h2 className="mt-1 text-xl font-bold tracking-[-0.04em] text-slate-950 sm:mt-2 sm:text-2xl">Log hours</h2>
        </div>
        {currentProject && onBackToProject ? (
          <button
            type="button"
            onClick={onBackToProject}
            className="pm-subtle-button rounded-xl px-3 py-2 text-xs font-semibold transition"
          >
            Back to project
          </button>
        ) : null}
      </div>

      <p className="mt-4 hidden max-w-[25ch] text-sm leading-6 text-slate-600 lg:block">
        Keep weekly time close to the work.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <div className="pm-metric-card rounded-2xl px-4 py-4">
          <div className={sectionLabelClass}>Visible this week</div>
          <div className="mt-2 text-3xl font-bold text-slate-950">{formatHoursFromMinutes(totalMinutes)}</div>
          <div className="mt-1 text-xs text-slate-500">
            {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}
          </div>
        </div>

        <div className="hidden pm-metric-card rounded-2xl px-4 py-4 lg:block">
          <div className={sectionLabelClass}>Context</div>
          <div className="mt-2 text-sm font-semibold text-slate-950">
            {selectedProjectId === 'all' ? 'All accessible projects' : (selectedProject?.name || 'Selected project')}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {viewMode === 'team' ? 'Team entries' : 'My entries'}
          </div>
        </div>
      </div>

      <div className="pm-accent-panel mt-3 rounded-2xl px-4 py-4 sm:mt-5">
        <div className={sectionLabelClass}>Week</div>
        <div className="mt-1 text-sm font-semibold text-slate-950">{formatWeekRange(weekStart)}</div>
        {offlineStatusLabel ? (
          <div className="mt-2 text-xs leading-5 text-slate-500">
            {offlineStatusLabel}
          </div>
        ) : null}
        {offlineQueueCount > 0 ? (
          <div className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            {offlineQueueCount} waiting to sync
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onPreviousWeek}
            className="pm-subtle-button rounded-xl px-3 py-2 text-sm font-semibold transition"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={onThisWeek}
            className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50"
          >
            This week
          </button>
          <button
            type="button"
            onClick={onNextWeek}
            className="pm-subtle-button rounded-xl px-3 py-2 text-sm font-semibold transition"
          >
            Next
          </button>
        </div>
      </div>

      <div className="pm-surface-soft mt-5 hidden rounded-2xl px-4 py-4 lg:block">
        <div className={sectionLabelClass}>Recent projects</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectProject('all')}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              selectedProjectId === 'all'
                ? 'border-slate-200 bg-white text-slate-950 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            All projects
          </button>
          {recentProjects.map((project) => {
            const color = getTrackProjectColor(project.id);
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelectProject(project.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  selectedProjectId === project.id
                    ? `${color.chip} border`
                    : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {project.name}
              </button>
            );
          })}
        </div>
      </div>

      {selectedProject && selectedProject.isOwned ? (
        <div className="pm-surface-soft mt-3 rounded-2xl px-4 py-4 sm:mt-5">
          <div className={sectionLabelClass}>View</div>
          <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => onViewModeChange('mine')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'mine' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              My entries
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('team')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'team' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Team entries
            </button>
          </div>
          <p className="mt-3 hidden text-xs leading-5 text-slate-500 lg:block">
            Owners can review all time logged against this project. Collaborators still manage only their own entries.
          </p>
        </div>
      ) : null}

      <div className="pm-home-panel mt-5 hidden rounded-2xl px-4 py-4 lg:block">
        <div className={sectionLabelClass}>Selection</div>
        {activeEntry ? (
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="font-semibold text-slate-950">{activeEntry.description || 'Untitled time entry'}</div>
            <div>{activeEntry.entry_date}</div>
            <div>{formatDurationMinutes(activeEntry.duration_minutes)}</div>
            <div>{getEntryProjectLabel(activeEntry, selectedProject, currentUserId)}</div>
            {activeEntry.user_id !== currentUserId ? (
              <p className="text-xs leading-5 text-slate-500">
                This entry is visible because you own the selected project. Only the original author can change it.
              </p>
            ) : (
              <p className="text-xs leading-5 text-slate-500">
                Editing mode is active. Update the composer to change this entry or remove it entirely.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Select a block in the week view to inspect it, or use the composer to add a new Timesheet entry.
          </p>
        )}
      </div>
    </aside>
  );
}
