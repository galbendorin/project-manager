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
  deletingEntryId,
  projectLoadError,
  entryError,
  successMessage,
  composer,
  onComposerChange,
  onSubmit,
  onResetComposer,
  onDeleteEntry,
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
          <aside className="rounded-[30px] bg-slate-950 px-5 py-5 text-white shadow-[0_38px_90px_-52px_rgba(15,23,42,0.95)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Track</p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Weekly time view</h2>
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

            <p className="mt-3 text-sm leading-6 text-slate-300">
              Manual entries first, with owned-project visibility for team time. Shared projects stay personal unless you own them.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Visible this week</div>
                <div className="mt-2 text-3xl font-bold">{formatHoursFromMinutes(totalMinutes)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Context</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {selectedProjectId === 'all' ? 'All accessible projects' : (selectedProject?.name || 'Selected project')}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {viewMode === 'team' ? 'Team entries' : 'My entries'}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Week</div>
                  <div className="mt-1 text-sm font-semibold text-white">{formatWeekRange(weekStart)}</div>
                </div>
                <button
                  type="button"
                  onClick={onThisWeek}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  This week
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onPreviousWeek}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Previous
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

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
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
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
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
                <p className="mt-3 text-xs leading-5 text-slate-400">
                  Owners can review all time logged against this project. Collaborators still manage only their own entries.
                </p>
              </div>
            ) : null}

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
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
                  Select a block in the week view to inspect it, or use the composer to add a new Track entry.
                </p>
              )}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="rounded-[30px] border border-slate-200/90 bg-white/95 p-5 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.4)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Quick add</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950">
                    What are you working on?
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Add real entries against owned or shared projects. This is the Track surface, so time stays separate from your project forms.
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
                  Track entries are not available in this environment yet. Apply the new `time_entries` SQL migration to enable the Track product.
                </div>
              ) : null}

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

            <div className="rounded-[30px] border border-slate-200/90 bg-white/95 p-5 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.4)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">This week</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950">Calendar-style week view</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Entries are grouped by day and colored by project, so the week reads more like a time product than a register.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold">
                    {selectedProjectId === 'all' ? 'My entries across all projects' : `${viewMode === 'team' ? 'Team' : 'My'} entries for ${selectedProject?.name || 'selected project'}`}
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                  Loading Track...
                </div>
              ) : projects.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                  Create or join a non-demo project to start using Track.
                </div>
              ) : (
                <>
                  <div className="mt-5 overflow-x-auto">
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

                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">How Track reads this week</div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Use the week navigator to move through time, project chips to focus a workspace, and the calendar blocks to jump straight into editing your own entries.
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
