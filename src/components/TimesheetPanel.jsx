import React, { useMemo } from 'react';
import {
  formatDurationMinutes,
  formatHoursFromMinutes,
  formatWeekRange,
  getTrackProjectColor,
  getVisibleHourRange,
  getWeekDates,
} from '../utils/timesheets';

const hourLabel = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelveHour}:00 ${suffix}`;
};

const clockLabel = (minutes) => {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelveHour}:${String(mins).padStart(2, '0')} ${suffix}`;
};

const formatEntryWindow = (entry) => {
  const start = Number(entry?.start_minutes);
  const duration = Number(entry?.duration_minutes);
  if (!Number.isFinite(start)) return '';
  const end = Number.isFinite(duration) ? start + duration : start;
  return `${clockLabel(start)} - ${clockLabel(end)}`;
};

const getEntryProjectLabel = (entry, project, currentUserId) => {
  if (entry.user_id === currentUserId) return 'You';
  if (project?.collaborator?.user_id === entry.user_id) {
    return project.collaborator.member_email;
  }
  return 'Team entry';
};

export default function TimesheetPanel({
  currentUserId,
  currentProject,
  projects,
  recentProjects,
  weekStart,
  onPreviousWeek,
  onNextWeek,
  onThisWeek,
  selectedProjectId,
  onSelectProject,
  selectedProject,
  viewMode,
  onViewModeChange,
  activeEntry,
  visibleEntries,
  summaryRows,
  totalMinutes,
  schemaReady,
  loading,
  saving,
  downloadingReport,
  deletingEntryId,
  projectLoadError,
  entryError,
  successMessage,
  composer,
  onComposerChange,
  onSubmit,
  onResetComposer,
  onDeleteEntry,
  onDownloadReport,
  onSelectEntry,
  onBackToProject,
}) {
  const weekDays = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const hourRange = useMemo(() => getVisibleHourRange(visibleEntries), [visibleEntries]);
  const hourHeight = 68;
  const totalGridHours = Math.max(1, (hourRange.endMinutes - hourRange.startMinutes) / 60);
  const gridHeight = totalGridHours * hourHeight;
  const hourMarks = Array.from({ length: totalGridHours + 1 }, (_, index) => hourRange.startMinutes + (index * 60));

  const entriesByDay = useMemo(() => (
    weekDays.reduce((acc, day) => {
      acc[day.iso] = visibleEntries.filter((entry) => entry.entry_date === day.iso);
      return acc;
    }, {})
  ), [visibleEntries, weekDays]);
  const selectedDay = useMemo(
    () => weekDays.find((day) => day.iso === composer.entryDate) || weekDays[0] || null,
    [composer.entryDate, weekDays]
  );
  const selectedDayEntries = selectedDay ? (entriesByDay[selectedDay.iso] || []) : [];
  const selectedDayTotalMinutes = useMemo(
    () => selectedDayEntries.reduce((total, entry) => total + (Number(entry.duration_minutes) || 0), 0),
    [selectedDayEntries]
  );
  const handleSelectMobileDay = (dayIso) => {
    if (activeEntry?.user_id === currentUserId && activeEntry.entry_date !== dayIso) {
      onResetComposer();
    }
    onComposerChange('entryDate', dayIso);
  };

  return (
    <div className="h-full overflow-auto bg-[#f6f2ea]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {(projectLoadError || entryError || successMessage) && (
          <div className="mb-4 space-y-3">
            {projectLoadError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {projectLoadError}
              </div>
            ) : null}
            {entryError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {entryError}
              </div>
            ) : null}
            {successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[26px] bg-slate-950 px-4 py-4 text-white shadow-[0_38px_90px_-52px_rgba(15,23,42,0.95)] sm:rounded-[30px] sm:px-5 sm:py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Timesheet</p>
                <h2 className="mt-1 text-xl font-bold tracking-[-0.04em] sm:mt-2 sm:text-2xl">This week</h2>
              </div>
              {currentProject && onBackToProject ? (
                <button
                  type="button"
                  onClick={onBackToProject}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Back to project
                </button>
              ) : null}
            </div>

            <p className="mt-3 hidden text-sm leading-6 text-slate-300 lg:block">
              Manual entries first, with owned-project visibility for team time. Shared projects stay personal unless you own them.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Visible this week</div>
                <div className="mt-2 text-3xl font-bold">{formatHoursFromMinutes(totalMinutes)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}
                </div>
              </div>

              <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-4 lg:block">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Context</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {selectedProjectId === 'all' ? 'All accessible projects' : (selectedProject?.name || 'Selected project')}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {viewMode === 'team' ? 'Team entries' : 'My entries'}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 sm:mt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Week</div>
              <div className="mt-1 text-sm font-semibold text-white">{formatWeekRange(weekStart)}</div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={onPreviousWeek}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={onThisWeek}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  This week
                </button>
                <button
                  type="button"
                  onClick={onNextWeek}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="mt-5 hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-4 lg:block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Recent projects</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelectProject('all')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    selectedProjectId === 'all'
                      ? 'border-white bg-white text-slate-950'
                      : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
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
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 sm:mt-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">View</div>
                <div className="mt-3 inline-flex rounded-full border border-white/10 bg-slate-900/60 p-1">
                  <button
                    type="button"
                    onClick={() => onViewModeChange('mine')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'mine' ? 'bg-white text-slate-950' : 'text-slate-300'}`}
                  >
                    My entries
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewModeChange('team')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'team' ? 'bg-white text-slate-950' : 'text-slate-300'}`}
                  >
                    Team entries
                  </button>
                </div>
                <p className="mt-3 hidden text-xs leading-5 text-slate-400 lg:block">
                  Owners can review all time logged against this project. Collaborators still manage only their own entries.
                </p>
              </div>
            ) : null}

            <div className="mt-5 hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-4 lg:block">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Selection</div>
              {activeEntry ? (
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <div className="font-semibold text-white">{activeEntry.description || 'Untitled time entry'}</div>
                  <div>{activeEntry.entry_date}</div>
                  <div>{formatDurationMinutes(activeEntry.duration_minutes)}</div>
                  <div>{getEntryProjectLabel(activeEntry, selectedProject, currentUserId)}</div>
                  {activeEntry.user_id !== currentUserId ? (
                    <p className="text-xs leading-5 text-slate-400">
                      This entry is visible because you own the selected project. Only the original author can change it.
                    </p>
                  ) : (
                    <p className="text-xs leading-5 text-slate-400">
                      Editing mode is active. Update the composer to change this entry or remove it entirely.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Select a block in the week view to inspect it, or use the composer to add a new Timesheet entry.
                </p>
              )}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="hidden rounded-[30px] border border-slate-200/90 bg-white/95 p-5 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.4)] lg:block">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Quick add</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950">
                    What are you working on?
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Add real entries against owned or shared projects. This is the Timesheet surface, so time stays separate from your project forms.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedProject ? (
                    <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getTrackProjectColor(selectedProject.id).chip}`}>
                      {selectedProject.isOwned ? 'Owned project' : 'Shared project'} · {selectedProject.name}
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                      Cross-project view
                    </span>
                  )}
                </div>
              </div>

              {!schemaReady ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Timesheet entries are not available in this environment yet. Apply the new `time_entries` SQL migration to enable the Timesheet product.
                </div>
              ) : null}

              <div className="hidden lg:block">
                <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,160px))]">
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Project</span>
                    <select
                      value={composer.projectId}
                      onChange={(event) => onComposerChange('projectId', event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    >
                      <option value="">Select a project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Date</span>
                    <input
                      type="date"
                      value={composer.entryDate}
                      onChange={(event) => onComposerChange('entryDate', event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Start</span>
                    <input
                      type="time"
                      value={composer.startTime}
                      onChange={(event) => onComposerChange('startTime', event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Minutes</span>
                    <input
                      type="number"
                      min="15"
                      step="15"
                      value={composer.durationMinutes}
                      onChange={(event) => onComposerChange('durationMinutes', event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      placeholder="60"
                    />
                  </label>
                </div>

                <label className="mt-3 block">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Description</span>
                  <input
                    type="text"
                    value={composer.description}
                    onChange={(event) => onComposerChange('description', event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                    placeholder="Planning, delivery follow-up, stakeholder review..."
                  />
                </label>

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {recentProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => {
                          onSelectProject(project.id);
                          onComposerChange('projectId', project.id);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${getTrackProjectColor(project.id).chip}`}
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeEntry?.user_id === currentUserId ? (
                      <button
                        type="button"
                        onClick={onDeleteEntry}
                        disabled={deletingEntryId === activeEntry.id}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingEntryId === activeEntry.id ? 'Deleting...' : 'Delete'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={onResetComposer}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={onSubmit}
                      disabled={!schemaReady || saving}
                      className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {saving ? 'Saving...' : activeEntry?.user_id === currentUserId ? 'Update entry' : 'Add entry'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-4 lg:hidden">
                <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Selected day</div>
                      <div className="mt-1 text-lg font-bold text-slate-950">
                        {selectedDay ? `${selectedDay.weekday} ${selectedDay.dayLabel}` : 'This week'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {selectedDay?.iso || composer.entryDate} · {formatHoursFromMinutes(selectedDayTotalMinutes)} logged
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                      {selectedDayEntries.length} {selectedDayEntries.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Project</span>
                      <select
                        value={composer.projectId}
                        onChange={(event) => onComposerChange('projectId', event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      >
                        <option value="">Select a project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Start</span>
                        <input
                          type="time"
                          value={composer.startTime}
                          onChange={(event) => onComposerChange('startTime', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Minutes</span>
                        <input
                          type="number"
                          min="15"
                          step="15"
                          value={composer.durationMinutes}
                          onChange={(event) => onComposerChange('durationMinutes', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                          placeholder="60"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Description</span>
                      <input
                        type="text"
                        value={composer.description}
                        onChange={(event) => onComposerChange('description', event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                        placeholder="Planning, delivery follow-up, stakeholder review..."
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {recentProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => {
                          onSelectProject(project.id);
                          onComposerChange('projectId', project.id);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${getTrackProjectColor(project.id).chip}`}
                      >
                        {project.name}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={onSubmit}
                      disabled={!schemaReady || saving}
                      className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {saving ? 'Saving...' : activeEntry?.user_id === currentUserId ? 'Update entry' : 'Add entry'}
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={onResetComposer}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                      >
                        Reset
                      </button>

                      {activeEntry?.user_id === currentUserId ? (
                        <button
                          type="button"
                          onClick={onDeleteEntry}
                          disabled={deletingEntryId === activeEntry.id}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingEntryId === activeEntry.id ? 'Deleting...' : 'Delete'}
                        </button>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-xs font-medium text-slate-500">
                          Pick a day below to change where this saves
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200/90 bg-white/95 p-5 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.4)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">This week</p>
                  <h3 className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-slate-950 lg:mt-2 lg:text-2xl">Calendar-style week view</h3>
                  <p className="mt-2 hidden text-sm leading-6 text-slate-500 lg:block">
                    Entries are grouped by day and colored by project, so the week reads more like a time product than a register.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold">
                    {selectedProjectId === 'all' ? 'My entries across all projects' : `${viewMode === 'team' ? 'Team' : 'My'} entries for ${selectedProject?.name || 'selected project'}`}
                  </span>
                  <button
                    type="button"
                    onClick={onDownloadReport}
                    disabled={loading || downloadingReport || !schemaReady}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {downloadingReport ? 'Downloading...' : 'Download report'}
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                  Loading Timesheet...
                </div>
              ) : projects.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                  Create or join a non-demo project to start using Timesheet.
                </div>
              ) : (
                <>
                  <div className="mt-5 lg:hidden space-y-4">
                    <div>
                      <div className="grid grid-cols-7 gap-1">
                        {weekDays.map((day) => {
                          const dayTotalMinutes = entriesByDay[day.iso].reduce((total, entry) => total + entry.duration_minutes, 0);
                          const isSelectedDay = selectedDay?.iso === day.iso;
                          return (
                            <button
                              key={day.iso}
                              type="button"
                              onClick={() => handleSelectMobileDay(day.iso)}
                              className={`min-w-0 rounded-xl border px-1.5 py-2 text-left transition ${
                                isSelectedDay
                                  ? 'border-slate-950 bg-slate-950 text-white shadow-md'
                                  : day.isToday
                                    ? 'border-indigo-200 bg-indigo-50 text-slate-900'
                                    : 'border-slate-200 bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${isSelectedDay ? 'text-slate-300' : 'text-slate-400'}`}>
                                {day.weekday}
                              </div>
                              <div className="mt-1 text-sm font-bold leading-none">{day.dayLabel}</div>
                              <div className={`mt-1 truncate text-[10px] leading-tight ${isSelectedDay ? 'text-slate-300' : 'text-slate-500'}`}>
                                {dayTotalMinutes > 0 ? formatDurationMinutes(dayTotalMinutes) : 'No time'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedDayEntries.length > 0 ? (
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Selected day</div>
                            <div className="mt-1 text-lg font-bold text-slate-950">
                              {selectedDay ? `${selectedDay.weekday} ${selectedDay.dayLabel}` : 'This week'}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {selectedDay?.iso || composer.entryDate} · {formatHoursFromMinutes(selectedDayTotalMinutes)}
                            </div>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                            {selectedDayEntries.length} items
                          </span>
                        </div>

                        <div className="mt-3 space-y-2.5">
                          {selectedDayEntries.map((entry) => {
                          const project = projects.find((item) => item.id === entry.project_id);
                          const color = getTrackProjectColor(entry.project_id);
                          const isSelected = activeEntry?.id === entry.id;

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => onSelectEntry(entry)}
                              className={`w-full rounded-2xl border px-3.5 py-3 text-left shadow-sm transition ${color.bg} ${color.border} ${isSelected ? 'ring-2 ring-slate-950/70' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className={`truncate text-sm font-semibold ${color.text}`}>
                                    {entry.description || 'Untitled entry'}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-600">
                                    {formatEntryWindow(entry)}
                                  </div>
                                </div>
                                <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                  {formatDurationMinutes(entry.duration_minutes)}
                                </span>
                              </div>

                              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-600">
                                <span className={`inline-block h-2 w-10 rounded-full ${color.accent}`} />
                                <span className="truncate">{project?.name || 'Project'}</span>
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {getEntryProjectLabel(entry, project, currentUserId)}
                              </div>
                            </button>
                          );
                        })}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-[24px] border border-slate-200 bg-white p-3.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Add time</div>
                            <div className="mt-1 text-lg font-bold text-slate-950">
                              {selectedDay ? `${selectedDay.weekday} ${selectedDay.dayLabel}` : 'Selected day'}
                            </div>
                            {selectedDayEntries.length === 0 ? (
                              <div className="mt-1 text-xs font-medium text-slate-500">
                                No entries yet for {selectedDay ? `${selectedDay.weekday} ${selectedDay.dayLabel}` : 'this day'}.
                              </div>
                            ) : null}
                          </div>
                          {selectedProject ? (
                            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getTrackProjectColor(selectedProject.id).chip}`}>
                              {selectedProject.name}
                            </span>
                          ) : null}
                        </div>

                      {!schemaReady ? (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                          Timesheet entries are not available in this environment yet. Apply the new `time_entries` SQL migration to enable the Timesheet product.
                        </div>
                      ) : null}

                      <div className="mt-3 grid gap-2.5">
                        <label className="block">
                          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Project</span>
                          <select
                            value={composer.projectId}
                            onChange={(event) => onComposerChange('projectId', event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                          >
                            <option value="">Select a project</option>
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="grid grid-cols-2 gap-2.5">
                          <label className="block">
                            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Start</span>
                            <input
                              type="time"
                              value={composer.startTime}
                              onChange={(event) => onComposerChange('startTime', event.target.value)}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Minutes</span>
                            <input
                              type="number"
                              min="15"
                              step="15"
                              value={composer.durationMinutes}
                              onChange={(event) => onComposerChange('durationMinutes', event.target.value)}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                              placeholder="60"
                            />
                          </label>
                        </div>

                        <label className="block">
                          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Description</span>
                          <input
                            type="text"
                            value={composer.description}
                            onChange={(event) => onComposerChange('description', event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                            placeholder="Planning, delivery follow-up, stakeholder review..."
                          />
                        </label>
                      </div>

                      <div className="mt-3 overflow-x-auto">
                        <div className="flex min-w-max gap-2 pb-1">
                          {recentProjects.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => {
                                onSelectProject(project.id);
                                onComposerChange('projectId', project.id);
                              }}
                              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${getTrackProjectColor(project.id).chip}`}
                            >
                              {project.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={onSubmit}
                          disabled={!schemaReady || saving}
                          className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {saving ? 'Saving...' : activeEntry?.user_id === currentUserId ? 'Update entry' : 'Add entry'}
                        </button>

                        <div className={`${activeEntry?.user_id === currentUserId ? 'grid grid-cols-2 gap-2' : 'flex'}`}>
                          <button
                            type="button"
                            onClick={onResetComposer}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                          >
                            Reset
                          </button>

                          {activeEntry?.user_id === currentUserId ? (
                            <button
                              type="button"
                              onClick={onDeleteEntry}
                              disabled={deletingEntryId === activeEntry.id}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingEntryId === activeEntry.id ? 'Deleting...' : 'Delete'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 hidden lg:block overflow-x-auto">
                    <div className="min-w-[920px]">
                      <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-slate-200">
                        <div className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Time</div>
                        {weekDays.map((day) => (
                          <div
                            key={day.iso}
                            className={`border-l border-slate-200 px-3 pb-3 ${day.iso === composer.entryDate ? 'bg-slate-50/80' : ''}`}
                          >
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{day.weekday}</div>
                            <div className="mt-1 text-lg font-bold text-slate-950">{day.dayLabel}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatDurationMinutes(entriesByDay[day.iso].reduce((total, entry) => total + entry.duration_minutes, 0))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]">
                        <div className="relative border-r border-slate-200" style={{ height: `${gridHeight}px` }}>
                          {hourMarks.slice(0, -1).map((mark) => (
                            <div
                              key={mark}
                              className="absolute left-0 right-0 -translate-y-1/2 px-3 text-[11px] text-slate-400"
                              style={{ top: `${((mark - hourRange.startMinutes) / 60) * hourHeight}px` }}
                            >
                              {hourLabel(mark)}
                            </div>
                          ))}
                        </div>

                        {weekDays.map((day) => (
                          <div
                            key={day.iso}
                            className={`relative border-l border-slate-200 ${day.iso === composer.entryDate ? 'bg-slate-50/70' : ''}`}
                            style={{ height: `${gridHeight}px` }}
                          >
                            {hourMarks.slice(0, -1).map((mark) => (
                              <div
                                key={`${day.iso}_${mark}`}
                                className="absolute left-0 right-0 border-t border-slate-100"
                                style={{ top: `${((mark - hourRange.startMinutes) / 60) * hourHeight}px` }}
                              />
                            ))}

                            {entriesByDay[day.iso].map((entry) => {
                              const project = projects.find((item) => item.id === entry.project_id);
                              const color = getTrackProjectColor(entry.project_id);
                              const top = ((entry.start_minutes - hourRange.startMinutes) / 60) * hourHeight;
                              const height = Math.max((entry.duration_minutes / 60) * hourHeight, 44);
                              const isSelected = activeEntry?.id === entry.id;

                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={() => onSelectEntry(entry)}
                                  className={`absolute left-2 right-2 overflow-hidden rounded-2xl border px-3 py-2 text-left shadow-sm transition hover:shadow-md ${color.bg} ${color.border} ${isSelected ? 'ring-2 ring-slate-950/70' : ''}`}
                                  style={{ top: `${top + 6}px`, height: `${height - 8}px` }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className={`min-w-0 text-sm font-semibold ${color.text}`}>
                                      {entry.description || 'Untitled entry'}
                                    </div>
                                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                      {formatDurationMinutes(entry.duration_minutes)}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                                    <span className={`inline-block h-2 w-10 rounded-full ${color.accent}`} />
                                    <span className="truncate">{project?.name || 'Project'}</span>
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {getEntryProjectLabel(entry, project, currentUserId)}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">How Timesheet works this week</div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        On phone, tap a day in the week strip to focus it and log time underneath. On larger screens, use the calendar blocks to jump straight into editing your own entries.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Project totals</div>
                      <div className="mt-3 space-y-3">
                        {summaryRows.length === 0 ? (
                          <div className="text-sm text-slate-500">No entries in this view yet.</div>
                        ) : summaryRows.map((row) => {
                          const color = getTrackProjectColor(row.projectId);
                          return (
                            <div key={row.projectId} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-slate-900">{row.project?.name || 'Project'}</div>
                                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                                    <span className={`inline-block h-2 w-10 rounded-full ${color.accent}`} />
                                    <span>{row.project?.isOwned ? 'Owned' : 'Shared'}</span>
                                  </div>
                                </div>
                                <div className="text-sm font-bold text-slate-900">{formatHoursFromMinutes(row.totalMinutes)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
