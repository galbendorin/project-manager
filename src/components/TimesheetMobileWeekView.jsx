import React from 'react';
import {
  formatDurationMinutes,
  formatHoursFromMinutes,
  getTrackProjectColor,
} from '../utils/timesheets';

export default function TimesheetMobileWeekView({
  activeEntry,
  composer,
  compactFieldClass,
  currentUserId,
  deletingEntryId,
  entriesByDay,
  entrySyncStateById,
  fieldLabelClass,
  formatEntryWindow,
  getEntryProjectLabel,
  handleSelectMobileDay,
  onComposerChange,
  onDeleteEntry,
  onResetComposer,
  onSelectEntry,
  onSelectProject,
  onSubmit,
  primaryButtonClass,
  projects,
  recentProjects,
  saving,
  schemaReady,
  sectionLabelClass,
  secondaryButtonClass,
  selectedDay,
  selectedDayEntries,
  selectedDayTotalMinutes,
  selectedProject,
  weekDays,
}) {
  return (
    <div className="mt-5 lg:hidden space-y-4">
      <div>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => {
            const dayTotalMinutes = (entriesByDay?.[day.iso] || []).reduce((total, entry) => total + entry.duration_minutes, 0);
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
              const syncState = entrySyncStateById?.[entry.id] || '';

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
                      {syncState ? (
                        <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                          syncState === 'syncing'
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}>
                          {syncState === 'syncing' ? 'Syncing' : 'Saved offline'}
                        </div>
                      ) : null}
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
  );
}
