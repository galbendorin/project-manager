import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  formatDurationMinutes,
  formatHoursFromMinutes,
  formatWeekRange,
  getTrackProjectColor,
  getWeekDates,
} from '../utils/timesheets';

const DAY_START_MINUTES = 0;
const DAY_END_MINUTES = 24 * 60;
const DEFAULT_VISIBLE_START_MINUTES = 8 * 60;
const DEFAULT_VISIBLE_END_MINUTES = 18 * 60;
const HOUR_HEIGHT = 40;
const QUARTER_HOUR_MINUTES = 15;
const QUARTER_HOUR_HEIGHT = HOUR_HEIGHT / 4;
const MIN_ENTRY_HEIGHT = 10;

const getEntryBlockMetrics = (startMinutes, durationMinutes) => {
  const safeStart = Math.max(DAY_START_MINUTES, Number(startMinutes) || 0);
  const safeDuration = Math.max(QUARTER_HOUR_MINUTES, Number(durationMinutes) || QUARTER_HOUR_MINUTES);
  const top = ((safeStart - DAY_START_MINUTES) / 60) * HOUR_HEIGHT;
  const rawHeight = (safeDuration / 60) * HOUR_HEIGHT;
  const height = Math.max(rawHeight - 2, Math.max(QUARTER_HOUR_HEIGHT - 1, MIN_ENTRY_HEIGHT));
  const isCompactEntry = height < 32;
  const isMicroEntry = height < 18;

  return { top, height, isCompactEntry, isMicroEntry };
};

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
  duplicateDraft,
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
  onDuplicateEntry,
  onPlaceDuplicateDraft,
  onBackToProject,
}) {
  const weekDays = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const desktopTimelineRef = useRef(null);
  const contextMenuRef = useRef(null);
  const [showWeekend, setShowWeekend] = useState(false);
  const [entryContextMenu, setEntryContextMenu] = useState(null);
  const totalGridHours = (DAY_END_MINUTES - DAY_START_MINUTES) / 60;
  const gridHeight = totalGridHours * HOUR_HEIGHT;
  const defaultTimelineHeight = ((DEFAULT_VISIBLE_END_MINUTES - DEFAULT_VISIBLE_START_MINUTES) / 60) * HOUR_HEIGHT;
  const hourMarks = Array.from({ length: totalGridHours + 1 }, (_, index) => DAY_START_MINUTES + (index * 60));
  const quarterMarks = Array.from(
    { length: ((DAY_END_MINUTES - DAY_START_MINUTES) / QUARTER_HOUR_MINUTES) + 1 },
    (_, index) => DAY_START_MINUTES + (index * QUARTER_HOUR_MINUTES)
  );

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
  const selectedDayIndex = selectedDay ? weekDays.findIndex((day) => day.iso === selectedDay.iso) : -1;
  const desktopWeekDays = useMemo(
    () => (showWeekend ? weekDays : weekDays.slice(0, 5)),
    [showWeekend, weekDays]
  );
  const desktopGridTemplate = `56px repeat(${desktopWeekDays.length}, minmax(0, 1fr))`;
  const selectedDayTotalMinutes = useMemo(
    () => selectedDayEntries.reduce((total, entry) => total + (Number(entry.duration_minutes) || 0), 0),
    [selectedDayEntries]
  );
  const fieldClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
  const compactFieldClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
  const secondaryButtonClass = 'pm-subtle-button rounded-2xl px-4 py-2.5 text-sm font-semibold transition hover:text-slate-900';
  const primaryButtonClass = 'rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_42px_-24px_rgba(79,70,229,0.86)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none';
  const sectionLabelClass = 'text-[11px] font-semibold text-slate-500';
  const fieldLabelClass = 'mb-2 block text-[11px] font-semibold text-slate-500';
  const handleSelectMobileDay = (dayIso) => {
    if (activeEntry?.user_id === currentUserId && activeEntry.entry_date !== dayIso) {
      onResetComposer();
    }
    onComposerChange('entryDate', dayIso);
  };

  const closeEntryContextMenu = useCallback(() => {
    setEntryContextMenu(null);
  }, []);

  useEffect(() => {
    if (!entryContextMenu) return undefined;

    const handlePointerDown = (event) => {
      if (contextMenuRef.current?.contains(event.target)) return;
      closeEntryContextMenu();
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeEntryContextMenu();
      }
    };

    window.addEventListener('resize', closeEntryContextMenu);
    window.addEventListener('scroll', closeEntryContextMenu, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', closeEntryContextMenu);
      window.removeEventListener('scroll', closeEntryContextMenu, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeEntryContextMenu, entryContextMenu]);

  const openEntryContextMenu = useCallback((event, entry) => {
    if (!entry || entry.user_id !== currentUserId) return;

    event.preventDefault();
    event.stopPropagation();
    onSelectEntry(entry);

    const menuWidth = 220;
    const menuHeight = 64;
    const left = Math.max(12, Math.min(event.clientX, window.innerWidth - menuWidth - 12));
    const top = Math.max(12, Math.min(event.clientY, window.innerHeight - menuHeight - 12));

    setEntryContextMenu({ entry, left, top });
  }, [currentUserId, onSelectEntry]);

  const handleDuplicateEntry = useCallback(() => {
    if (!entryContextMenu?.entry) return;
    onDuplicateEntry(entryContextMenu.entry);
    closeEntryContextMenu();
  }, [closeEntryContextMenu, entryContextMenu, onDuplicateEntry]);

  const handleDesktopDraftPlacement = useCallback((dayIso, event) => {
    if (!duplicateDraft || typeof onPlaceDuplicateDraft !== 'function') return;

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = Math.max(0, event.clientY - rect.top);
    const rawMinutes = DAY_START_MINUTES + ((offsetY / HOUR_HEIGHT) * 60);
    const snappedMinutes = Math.round(rawMinutes / QUARTER_HOUR_MINUTES) * QUARTER_HOUR_MINUTES;
    const durationMinutes = Math.max(
      QUARTER_HOUR_MINUTES,
      Number(duplicateDraft.duration_minutes) || QUARTER_HOUR_MINUTES
    );
    const maxStart = Math.max(DAY_START_MINUTES, DAY_END_MINUTES - durationMinutes);
    const nextStartMinutes = Math.max(
      DAY_START_MINUTES,
      Math.min(snappedMinutes, maxStart)
    );

    onPlaceDuplicateDraft(dayIso, nextStartMinutes);
  }, [duplicateDraft, onPlaceDuplicateDraft]);

  const entryContextMenuNode = entryContextMenu && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-[90] w-[220px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_55px_-28px_rgba(15,23,42,0.35)]"
          style={{ left: `${entryContextMenu.left}px`, top: `${entryContextMenu.top}px` }}
        >
          <button
            type="button"
            onClick={handleDuplicateEntry}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-indigo-50"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">Duplicate entry</div>
              <div className="text-xs text-slate-500">Create a copy and move it to another slot</div>
            </div>
            <span className="text-indigo-600">+</span>
          </button>
        </div>,
        document.body
      )
    : null;

  useEffect(() => {
    const timeline = desktopTimelineRef.current;
    if (!timeline) return;
    timeline.scrollTop = (DEFAULT_VISIBLE_START_MINUTES / 60) * HOUR_HEIGHT;
  }, [weekStart]);

  useEffect(() => {
    if (selectedDayIndex >= 5) {
      setShowWeekend(true);
    }
  }, [selectedDayIndex]);

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

          <section className="space-y-4">
            <div className="pm-home-panel hidden rounded-[30px] p-5 lg:block">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className={sectionLabelClass}>Quick add</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950">
                    Track work for the week
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Log time against owned and shared projects in the same calm workspace style as the rest of PM Workspace.
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
                  <button
                    type="button"
                    onClick={onDownloadReport}
                    disabled={loading || downloadingReport || !schemaReady}
                    className={primaryButtonClass}
                  >
                    {downloadingReport ? 'Downloading...' : 'Download report'}
                  </button>
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
                    <span className={fieldLabelClass}>Project</span>
                    <select
                      value={composer.projectId}
                      onChange={(event) => onComposerChange('projectId', event.target.value)}
                      className={fieldClass}
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
                    <span className={fieldLabelClass}>Date</span>
                    <input
                      type="date"
                      value={composer.entryDate}
                      onChange={(event) => onComposerChange('entryDate', event.target.value)}
                      className={fieldClass}
                    />
                  </label>

                  <label className="block">
                    <span className={fieldLabelClass}>Start</span>
                    <input
                      type="time"
                      value={composer.startTime}
                      onChange={(event) => onComposerChange('startTime', event.target.value)}
                      className={fieldClass}
                    />
                  </label>

                  <label className="block">
                    <span className={fieldLabelClass}>Minutes</span>
                    <input
                      type="number"
                      min="15"
                      step="15"
                      value={composer.durationMinutes}
                      onChange={(event) => onComposerChange('durationMinutes', event.target.value)}
                      className={fieldClass}
                      placeholder="60"
                    />
                  </label>
                </div>

                <label className="mt-3 block">
                  <span className={fieldLabelClass}>Description</span>
                  <input
                    type="text"
                    value={composer.description}
                    onChange={(event) => onComposerChange('description', event.target.value)}
                    className={fieldClass}
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
                      className={secondaryButtonClass}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={onSubmit}
                      disabled={!schemaReady || saving}
                      className={primaryButtonClass}
                    >
                      {saving ? 'Saving...' : activeEntry?.user_id === currentUserId ? 'Update entry' : 'Add entry'}
                    </button>
                  </div>
                </div>
              </div>

                <div className="mt-5 space-y-4 lg:hidden">
                <div className="pm-home-panel rounded-[26px] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={sectionLabelClass}>Selected day</div>
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
                      <span className={fieldLabelClass}>Project</span>
                      <select
                        value={composer.projectId}
                        onChange={(event) => onComposerChange('projectId', event.target.value)}
                        className={fieldClass}
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
                        <span className={fieldLabelClass}>Start</span>
                        <input
                          type="time"
                          value={composer.startTime}
                          onChange={(event) => onComposerChange('startTime', event.target.value)}
                          className={fieldClass}
                        />
                      </label>

                      <label className="block">
                        <span className={fieldLabelClass}>Minutes</span>
                        <input
                          type="number"
                          min="15"
                          step="15"
                          value={composer.durationMinutes}
                          onChange={(event) => onComposerChange('durationMinutes', event.target.value)}
                          className={fieldClass}
                          placeholder="60"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className={fieldLabelClass}>Description</span>
                      <input
                        type="text"
                        value={composer.description}
                        onChange={(event) => onComposerChange('description', event.target.value)}
                        className={fieldClass}
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
                      className={primaryButtonClass}
                    >
                      {saving ? 'Saving...' : activeEntry?.user_id === currentUserId ? 'Update entry' : 'Add entry'}
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={onResetComposer}
                        className={secondaryButtonClass}
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

            <div className="pm-home-panel rounded-[30px] p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className={sectionLabelClass}>This week</p>
                  <h3 className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-slate-950 lg:mt-2 lg:text-2xl">Week view</h3>
                  <p className="mt-2 hidden text-sm leading-6 text-slate-500 lg:block">
                    {duplicateDraft
                      ? 'Click a slot in the grid to place the duplicate, then save it.'
                      : 'See time by day and project.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold">
                    {selectedProjectId === 'all' ? 'All projects' : `${viewMode === 'team' ? 'Team' : 'My'} · ${selectedProject?.name || 'Selected project'}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowWeekend((current) => !current)}
                    className="hidden rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 lg:inline-flex"
                  >
                    {showWeekend ? 'Hide weekend' : '+ Weekend'}
                  </button>
                  <button
                    type="button"
                    onClick={onDownloadReport}
                    disabled={loading || downloadingReport || !schemaReady}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 lg:hidden"
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
                      <div className="pm-home-panel rounded-[24px] p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={sectionLabelClass}>Selected day</div>
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

                    <div className="pm-accent-panel rounded-[24px] p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={sectionLabelClass}>Add time</div>
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
                          <span className={fieldLabelClass}>Project</span>
                          <select
                            value={composer.projectId}
                            onChange={(event) => onComposerChange('projectId', event.target.value)}
                            className={compactFieldClass}
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
                            <span className={fieldLabelClass}>Start</span>
                            <input
                              type="time"
                              value={composer.startTime}
                              onChange={(event) => onComposerChange('startTime', event.target.value)}
                              className={compactFieldClass}
                            />
                          </label>

                          <label className="block">
                            <span className={fieldLabelClass}>Minutes</span>
                            <input
                              type="number"
                              min="15"
                              step="15"
                              value={composer.durationMinutes}
                              onChange={(event) => onComposerChange('durationMinutes', event.target.value)}
                              className={compactFieldClass}
                              placeholder="60"
                            />
                          </label>
                        </div>

                        <label className="block">
                          <span className={fieldLabelClass}>Description</span>
                          <input
                            type="text"
                            value={composer.description}
                            onChange={(event) => onComposerChange('description', event.target.value)}
                            className={compactFieldClass}
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
                          className={primaryButtonClass}
                        >
                          {saving ? 'Saving...' : activeEntry?.user_id === currentUserId ? 'Update entry' : 'Add entry'}
                        </button>

                        <div className={`${activeEntry?.user_id === currentUserId ? 'grid grid-cols-2 gap-2' : 'flex'}`}>
                          <button
                            type="button"
                            onClick={onResetComposer}
                            className={secondaryButtonClass}
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
                    <div className="w-full min-w-0">
                      <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: desktopGridTemplate }}>
                        <div className="px-2 pb-3 text-[11px] font-semibold text-slate-500">Time</div>
                        {desktopWeekDays.map((day) => (
                          <div
                            key={day.iso}
                            className={`border-l border-slate-200 px-2 pb-3 ${day.iso === composer.entryDate ? 'bg-slate-50/80' : ''}`}
                          >
                            <div className="text-[11px] font-semibold text-slate-500">{day.weekday}</div>
                            <div className="mt-1 text-base font-bold text-slate-950">{day.dayLabel}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatDurationMinutes(entriesByDay[day.iso].reduce((total, entry) => total + entry.duration_minutes, 0))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div ref={desktopTimelineRef} className="overflow-y-auto rounded-b-[26px]" style={{ height: `${defaultTimelineHeight}px` }}>
                        <div className="grid" style={{ gridTemplateColumns: desktopGridTemplate }}>
                        <div className="relative border-r border-slate-200 bg-white/70" style={{ height: `${gridHeight}px` }}>
                          {hourMarks.slice(0, -1).map((mark) => (
                            <div
                              key={mark}
                              className="absolute left-0 right-0 -translate-y-1/2 px-2 text-[10px] text-slate-400"
                              style={{ top: `${((mark - DAY_START_MINUTES) / 60) * HOUR_HEIGHT}px` }}
                            >
                              {hourLabel(mark)}
                            </div>
                          ))}
                        </div>

                        {desktopWeekDays.map((day) => (
                          <div
                            key={day.iso}
                            onClick={(event) => handleDesktopDraftPlacement(day.iso, event)}
                            className={`relative border-l border-slate-200 ${day.iso === composer.entryDate ? 'bg-slate-50/70' : ''} ${duplicateDraft ? 'cursor-copy' : ''}`}
                            style={{ height: `${gridHeight}px` }}
                          >
                            {quarterMarks.slice(0, -1).map((mark) => (
                              <div
                                key={`${day.iso}_${mark}`}
                                className={`absolute left-0 right-0 border-t ${mark % 60 === 0 ? 'border-slate-200' : 'border-slate-100/90'}`}
                                style={{ top: `${((mark - DAY_START_MINUTES) / 60) * HOUR_HEIGHT}px` }}
                              />
                            ))}

                            {entriesByDay[day.iso].map((entry) => {
                              const project = projects.find((item) => item.id === entry.project_id);
                              const color = getTrackProjectColor(entry.project_id);
                              const { top, height, isCompactEntry, isMicroEntry } = getEntryBlockMetrics(
                                entry.start_minutes,
                                entry.duration_minutes
                              );
                              const isSelected = activeEntry?.id === entry.id;

                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectEntry(entry);
                                  }}
                                  onContextMenu={(event) => openEntryContextMenu(event, entry)}
                                  className={`absolute left-1 right-1 overflow-hidden border text-left shadow-sm transition hover:shadow-md ${isCompactEntry ? 'rounded-xl px-2 py-1' : 'rounded-2xl px-3 py-2'} ${color.bg} ${color.border} ${isSelected ? 'ring-2 ring-slate-950/70' : ''}`}
                                  style={{ top: `${top + 1}px`, height: `${height}px` }}
                                  title={`${entry.description || 'Untitled entry'} · ${formatEntryWindow(entry)} · ${formatDurationMinutes(entry.duration_minutes)}`}
                                >
                                  {isMicroEntry ? (
                                    <div className="flex h-full items-center gap-1 overflow-hidden">
                                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color.accent}`} />
                                      <span className={`truncate text-[9px] font-semibold ${color.text}`}>
                                        {formatDurationMinutes(entry.duration_minutes)}
                                      </span>
                                    </div>
                                  ) : isCompactEntry ? (
                                    <div className="flex h-full items-center justify-between gap-2">
                                      <div className={`min-w-0 truncate text-[10px] font-semibold ${color.text}`}>
                                        {entry.description || project?.name || 'Entry'}
                                      </div>
                                      <span className="shrink-0 text-[9px] font-semibold text-slate-600">
                                        {formatDurationMinutes(entry.duration_minutes)}
                                      </span>
                                    </div>
                                  ) : (
                                    <>
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
                                    </>
                                  )}
                                </button>
                              );
                            })}

                            {duplicateDraft && duplicateDraft.entry_date === day.iso ? (() => {
                              const draftProject = projects.find((item) => item.id === duplicateDraft.project_id);
                              const draftColor = getTrackProjectColor(duplicateDraft.project_id);
                              const { top, height, isCompactEntry, isMicroEntry } = getEntryBlockMetrics(
                                duplicateDraft.start_minutes,
                                duplicateDraft.duration_minutes
                              );
                              const draftTitle = duplicateDraft.description || draftProject?.name || 'Draft copy';

                              return (
                                <button
                                  key="duplicate-draft"
                                  type="button"
                                  onClick={(event) => event.stopPropagation()}
                                  className={`absolute left-1 right-1 overflow-hidden border-2 border-dashed text-left shadow-sm ${isCompactEntry ? 'rounded-xl px-2 py-1' : 'rounded-2xl px-3 py-2'} ${draftColor.bg} ${draftColor.border} ring-2 ring-indigo-200/80`}
                                  style={{ top: `${top + 1}px`, height: `${height}px` }}
                                  title={`Draft duplicate · ${draftTitle} · ${formatEntryWindow(duplicateDraft)} · ${formatDurationMinutes(duplicateDraft.duration_minutes)}`}
                                >
                                  {isMicroEntry ? (
                                    <div className="flex h-full items-center gap-1 overflow-hidden">
                                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${draftColor.accent}`} />
                                      <span className={`truncate text-[9px] font-semibold ${draftColor.text}`}>
                                        Draft
                                      </span>
                                    </div>
                                  ) : isCompactEntry ? (
                                    <div className="flex h-full items-center justify-between gap-2">
                                      <div className={`min-w-0 truncate text-[10px] font-semibold ${draftColor.text}`}>
                                        {draftTitle}
                                      </div>
                                      <span className="shrink-0 text-[9px] font-semibold text-slate-600">
                                        Draft
                                      </span>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-start justify-between gap-2">
                                        <div className={`min-w-0 text-sm font-semibold ${draftColor.text}`}>
                                          {draftTitle}
                                        </div>
                                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                          Draft
                                        </span>
                                      </div>
                                      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                                        <span className={`inline-block h-2 w-10 rounded-full ${draftColor.accent}`} />
                                        <span className="truncate">{draftProject?.name || 'Project'}</span>
                                      </div>
                                      <div className="mt-1 text-[11px] text-slate-500">
                                        Click another slot to move it
                                      </div>
                                    </>
                                  )}
                                </button>
                              );
                            })() : null}
                          </div>
                        ))}
                      </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="pm-surface-soft rounded-2xl px-4 py-4">
                      <div className={sectionLabelClass}>How Timesheet works</div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        On phone, tap a day in the week strip to focus it and log time underneath. On larger screens, use the calendar blocks to jump straight into editing your own entries.
                      </p>
                    </div>

                    <div className="pm-surface-soft rounded-2xl px-4 py-4">
                      <div className={sectionLabelClass}>Project totals</div>
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
      {entryContextMenuNode}
    </div>
  );
}
