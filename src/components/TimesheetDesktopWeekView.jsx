import React, { useEffect, useRef } from 'react';
import { formatDurationMinutes, getTrackProjectColor } from '../utils/timesheets';

export default function TimesheetDesktopWeekView({
  activeEntry,
  composerEntryDate,
  currentUserId,
  defaultTimelineHeight,
  desktopGridTemplate,
  desktopWeekDays,
  duplicateDraft,
  entriesByDay,
  formatEntryWindow,
  getEntryBlockMetrics,
  getEntryProjectLabel,
  gridHeight,
  handleDesktopDraftPlacement,
  hourLabel,
  hourMarks,
  onSelectEntry,
  openEntryContextMenu,
  projects,
  quarterMarks,
  weekStart,
}) {
  const desktopTimelineRef = useRef(null);

  useEffect(() => {
    const timeline = desktopTimelineRef.current;
    if (!timeline) return;
    timeline.scrollTop = 8 * 40;
  }, [weekStart]);

  return (
    <div className="mt-5 hidden lg:block overflow-x-auto">
      <div className="w-full min-w-0">
        <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: desktopGridTemplate }}>
          <div className="px-2 pb-3 text-[11px] font-semibold text-slate-500">Time</div>
          {desktopWeekDays.map((day) => {
            const dayEntries = entriesByDay[day.iso] || [];
            return (
              <div
                key={day.iso}
                className={`border-l border-slate-200 px-2 pb-3 ${day.iso === composerEntryDate ? 'bg-slate-50/80' : ''}`}
              >
                <div className="text-[11px] font-semibold text-slate-500">{day.weekday}</div>
                <div className="mt-1 text-base font-bold text-slate-950">{day.dayLabel}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatDurationMinutes(dayEntries.reduce((total, entry) => total + entry.duration_minutes, 0))}
                </div>
              </div>
            );
          })}
        </div>

        <div ref={desktopTimelineRef} className="overflow-y-auto rounded-b-[26px]" style={{ height: `${defaultTimelineHeight}px` }}>
          <div className="grid" style={{ gridTemplateColumns: desktopGridTemplate }}>
            <div className="relative border-r border-slate-200 bg-white/70" style={{ height: `${gridHeight}px` }}>
              {hourMarks.slice(0, -1).map((mark) => (
                <div
                  key={mark}
                  className="absolute left-0 right-0 -translate-y-1/2 px-2 text-[10px] text-slate-400"
                  style={{ top: `${(mark / 60) * 40}px` }}
                >
                  {hourLabel(mark)}
                </div>
              ))}
            </div>

            {desktopWeekDays.map((day) => {
              const dayEntries = entriesByDay[day.iso] || [];

              return (
                <div
                  key={day.iso}
                  onClick={(event) => handleDesktopDraftPlacement(day.iso, event)}
                  className={`relative border-l border-slate-200 ${day.iso === composerEntryDate ? 'bg-slate-50/70' : ''} ${duplicateDraft ? 'cursor-copy' : ''}`}
                  style={{ height: `${gridHeight}px` }}
                >
                  {quarterMarks.slice(0, -1).map((mark) => (
                    <div
                      key={`${day.iso}_${mark}`}
                      className={`absolute left-0 right-0 border-t ${mark % 60 === 0 ? 'border-slate-200' : 'border-slate-100/90'}`}
                      style={{ top: `${(mark / 60) * 40}px` }}
                    />
                  ))}

                  {dayEntries.map((entry) => {
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
