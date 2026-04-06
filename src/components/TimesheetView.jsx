import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import TimesheetPanel from './TimesheetPanel';
import MobileSyncCenter from './MobileSyncCenter';
import { useTimesheetOfflineSync } from '../hooks/useTimesheetOfflineSync';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { isOfflineTempId } from '../utils/offlineState';
import { enqueueCreate, enqueueDelete, enqueueUpdate } from '../utils/offlineQueue';
import { loadXLSX } from '../utils/importParsers';
import { normalizeProjectRecord } from '../utils/projectSharing';
import {
  addWeeks,
  buildProjectDurationSummary,
  buildTimesheetReportFileName,
  buildTimesheetReportRows,
  buildTimeEntryPayload,
  filterTimesheetProjects,
  getWeekDateRange,
  minutesToTimeInput,
  parseTimeInputToMinutes,
  sumEntryDurationMinutes,
  TIMESHEET_REPORT_COLUMNS,
  toWeekStartIso,
} from '../utils/timesheets';
import {
  createDefaultComposer,
  createOfflineTimeEntry,
  formatSyncTimeLabel,
  getDefaultDateForWeek,
  isSchemaMissingError,
  loadTimesheetOfflineState,
  loadTimesheetOfflineStateAsync,
  queryTimesheetProjects,
  saveTimesheetOfflineState,
  sleep,
  sortEntries,
} from '../utils/timesheetViewState';

export default function TimesheetView({
  currentUserId,
  currentProject = null,
  onBackToProject,
}) {
  const isOnline = useOnlineStatus();
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectLoadError, setProjectLoadError] = useState('');
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [entryError, setEntryError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [schemaReady, setSchemaReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState('');
  const [weekStart, setWeekStart] = useState(() => {
    const cachedState = loadTimesheetOfflineState(currentUserId);
    return cachedState.weekStart || toWeekStartIso(new Date());
  });
  const initialProjectId = currentProject?.is_demo ? '' : (currentProject?.id || '');
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    const cachedState = loadTimesheetOfflineState(currentUserId);
    return initialProjectId || cachedState.selectedProjectId || 'all';
  });
  const [viewMode, setViewMode] = useState(() => {
    const cachedState = loadTimesheetOfflineState(currentUserId);
    return cachedState.viewMode || 'mine';
  });
  const [activeEntryId, setActiveEntryId] = useState('');
  const [duplicateDraftActive, setDuplicateDraftActive] = useState(false);
  const [composer, setComposer] = useState(() => createDefaultComposer(initialProjectId, toWeekStartIso(new Date())));
  const [offlineQueue, setOfflineQueue] = useState(() => {
    const cachedState = loadTimesheetOfflineState(currentUserId);
    return Array.isArray(cachedState.queue) ? cachedState.queue : [];
  });
  const [lastSyncedAt, setLastSyncedAt] = useState(() => {
    const cachedState = loadTimesheetOfflineState(currentUserId);
    return cachedState.lastSyncedAt || '';
  });

  const persistOfflineState = useCallback((nextState) => {
    saveTimesheetOfflineState(currentUserId, nextState);
    setOfflineQueue(Array.isArray(nextState.queue) ? nextState.queue : []);
    setLastSyncedAt(nextState.lastSyncedAt || '');
    return nextState;
  }, [currentUserId]);

  const trackProjects = useMemo(() => filterTimesheetProjects(projects), [projects]);
  const selectedProject = useMemo(
    () => trackProjects.find((project) => project.id === selectedProjectId) || null,
    [trackProjects, selectedProjectId]
  );

  const activeEntry = useMemo(
    () => entries.find((entry) => entry.id === activeEntryId) || null,
    [entries, activeEntryId]
  );
  const editingOwnEntry = Boolean(activeEntry && activeEntry.user_id === currentUserId);
  const duplicateDraft = useMemo(() => {
    if (!duplicateDraftActive) return null;
    const startMinutes = parseTimeInputToMinutes(composer.startTime);
    const durationMinutes = Number(composer.durationMinutes);

    if (!composer.projectId || !composer.entryDate || startMinutes == null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return null;
    }

    return {
      id: 'duplicate-draft',
      project_id: composer.projectId,
      user_id: currentUserId,
      entry_date: composer.entryDate,
      start_minutes: startMinutes,
      duration_minutes: Math.round(durationMinutes),
      description: composer.description || '',
      isDraft: true,
    };
  }, [composer.description, composer.durationMinutes, composer.entryDate, composer.projectId, composer.startTime, currentUserId, duplicateDraftActive]);

  useEffect(() => {
    const cachedState = loadTimesheetOfflineState(currentUserId);
    if (cachedState.projects?.length) {
      setProjects(cachedState.projects);
    }
    setOfflineQueue(Array.isArray(cachedState.queue) ? cachedState.queue : []);
    setLastSyncedAt(cachedState.lastSyncedAt || '');
    if (!currentProject?.id || currentProject?.is_demo) {
      if (cachedState.weekStart) {
        setWeekStart(cachedState.weekStart);
      }
      if (cachedState.selectedProjectId) {
        setSelectedProjectId(cachedState.selectedProjectId);
      }
      if (cachedState.viewMode) {
        setViewMode(cachedState.viewMode);
      }
    }

    let active = true;
    void loadTimesheetOfflineStateAsync(currentUserId).then((preferredState) => {
      if (!active || !preferredState) return;
      if (preferredState.projects?.length) {
        setProjects(preferredState.projects);
      }
      setOfflineQueue(Array.isArray(preferredState.queue) ? preferredState.queue : []);
      setLastSyncedAt(preferredState.lastSyncedAt || '');
      if (!currentProject?.id || currentProject?.is_demo) {
        if (preferredState.weekStart) {
          setWeekStart(preferredState.weekStart);
        }
        if (preferredState.selectedProjectId) {
          setSelectedProjectId(preferredState.selectedProjectId);
        }
        if (preferredState.viewMode) {
          setViewMode(preferredState.viewMode);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [currentProject?.id, currentProject?.is_demo, currentUserId]);

  const loadProjects = useCallback(async () => {
    if (!currentUserId) return;

    setLoadingProjects(true);
    setProjectLoadError('');

    const cachedState = await loadTimesheetOfflineStateAsync(currentUserId);
    if (cachedState.projects?.length) {
      setProjects(cachedState.projects);
    }

    if (!isOnline) {
      if (!cachedState.projects?.length) {
        setProjectLoadError('You are offline. Open Timesheet once online on this device to keep it available.');
      }
      setLoadingProjects(false);
      return;
    }

    let { data, error } = await queryTimesheetProjects();

    if (error || !data) {
      await sleep(1000);
      const retry = await queryTimesheetProjects();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      setProjectLoadError('Unable to load accessible projects for Timesheet right now.');
      setProjects([]);
      setLoadingProjects(false);
      return;
    }

    const nextProjects = (data || []).map((project) => normalizeProjectRecord(project, currentUserId));
    setProjects(nextProjects);
    persistOfflineState({
      ...cachedState,
      projects: nextProjects,
      selectedProjectId,
      weekStart,
      viewMode,
    });
    setLoadingProjects(false);
  }, [currentUserId, isOnline, persistOfflineState, selectedProjectId, viewMode, weekStart]);

  const loadEntries = useCallback(async () => {
    if (!currentUserId) return;

    const { start, endInclusive } = getWeekDateRange(weekStart);
    setLoadingEntries(true);
    setEntryError('');
    setSuccessMessage('');

    const cachedState = await loadTimesheetOfflineStateAsync(currentUserId);
    const cachedEntries = cachedState.entriesByWeek?.[weekStart] || [];
    if (cachedEntries.length) {
      setEntries(sortEntries(cachedEntries));
    }

    if (!isOnline) {
      if (!cachedEntries.length) {
        setEntryError('You are offline. Open this week once online on this device to cache it.');
      }
      setLoadingEntries(false);
      return;
    }

    const { data, error } = await supabase
      .from('time_entries')
      .select('id, project_id, user_id, entry_date, start_minutes, duration_minutes, description, created_at, updated_at')
      .gte('entry_date', start)
      .lte('entry_date', endInclusive)
      .order('entry_date', { ascending: true })
      .order('start_minutes', { ascending: true });

    if (error) {
      if (isSchemaMissingError(error)) {
        setSchemaReady(false);
        setEntries([]);
        setLoadingEntries(false);
        return;
      }

      setEntryError('Unable to load Timesheet entries for this week right now.');
      setLoadingEntries(false);
      return;
    }

    setSchemaReady(true);
    const nextEntries = sortEntries(data || []);
    setEntries(nextEntries);
    persistOfflineState({
      ...cachedState,
      entriesByWeek: {
        ...(cachedState.entriesByWeek || {}),
        [weekStart]: nextEntries,
      },
      selectedProjectId,
      weekStart,
      viewMode,
      lastSyncedAt: new Date().toISOString(),
    });
    setLoadingEntries(false);
  }, [currentUserId, isOnline, persistOfflineState, selectedProjectId, viewMode, weekStart]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!currentUserId) return;
    const cachedState = loadTimesheetOfflineState(currentUserId);
    persistOfflineState({
      ...cachedState,
      projects,
      entriesByWeek: {
        ...(cachedState.entriesByWeek || {}),
        [weekStart]: entries,
      },
      selectedProjectId,
      weekStart,
      viewMode,
    });
  }, [currentUserId, entries, persistOfflineState, projects, selectedProjectId, viewMode, weekStart]);

  useEffect(() => {
    if (currentProject?.id && !currentProject?.is_demo) {
      setSelectedProjectId(currentProject.id);
      setComposer((current) => ({
        ...current,
        projectId: current.projectId || currentProject.id,
      }));
      return;
    }

    setSelectedProjectId((current) => current || 'all');
  }, [currentProject?.id, currentProject?.is_demo]);

  useEffect(() => {
    if (selectedProjectId !== 'all' && !trackProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId('all');
    }
  }, [trackProjects, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId === 'all' || selectedProject?.isOwned) return;
    if (viewMode !== 'mine') {
      setViewMode('mine');
    }
  }, [selectedProjectId, selectedProject?.isOwned, viewMode]);

  useEffect(() => {
    if (editingOwnEntry) return;
    setComposer((current) => {
      const { start, endInclusive } = getWeekDateRange(weekStart);
      const nextProjectId = current.projectId || (
        !currentProject?.is_demo && currentProject?.id
          ? currentProject.id
          : (selectedProjectId !== 'all' ? selectedProjectId : '')
      );
      const nextDate = !current.entryDate || current.entryDate < start || current.entryDate > endInclusive
        ? getDefaultDateForWeek(weekStart)
        : current.entryDate;

      if (current.projectId === nextProjectId && current.entryDate === nextDate) {
        return current;
      }

      return {
        ...current,
        projectId: nextProjectId,
        entryDate: nextDate,
      };
    });
  }, [currentProject?.id, currentProject?.is_demo, editingOwnEntry, selectedProjectId, weekStart]);

  const visibleEntries = useMemo(() => {
    const scopedEntries = selectedProjectId === 'all'
      ? entries
      : entries.filter((entry) => entry.project_id === selectedProjectId);

    if (selectedProjectId !== 'all' && viewMode === 'team' && selectedProject?.isOwned) {
      return scopedEntries;
    }

    return scopedEntries.filter((entry) => entry.user_id === currentUserId);
  }, [currentUserId, entries, selectedProject?.isOwned, selectedProjectId, viewMode]);

  const weeklyTotalMinutes = useMemo(() => sumEntryDurationMinutes(visibleEntries), [visibleEntries]);
  const summaryRows = useMemo(
    () => buildProjectDurationSummary(visibleEntries, trackProjects),
    [visibleEntries, trackProjects]
  );
  const recentProjects = useMemo(() => trackProjects.slice(0, 5), [trackProjects]);

  const handleComposerChange = useCallback((key, value) => {
    setEntryError('');
    setSuccessMessage('');
    setComposer((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const resetComposer = useCallback(() => {
    setDuplicateDraftActive(false);
    setActiveEntryId('');
    setEntryError('');
    setSuccessMessage('');
    setComposer(createDefaultComposer(
      !currentProject?.is_demo && currentProject?.id
        ? currentProject.id
        : (selectedProjectId !== 'all' ? selectedProjectId : ''),
      weekStart
    ));
  }, [currentProject?.id, currentProject?.is_demo, selectedProjectId, weekStart]);

  const handleSelectProject = useCallback((projectId) => {
    setSelectedProjectId(projectId);
    setEntryError('');
    setSuccessMessage('');
    setActiveEntryId('');
    if (projectId !== 'all') {
      setComposer((current) => ({
        ...current,
        projectId,
      }));
    }
  }, []);

  const handleSelectEntry = useCallback((entry) => {
    if (!entry) return;

    setDuplicateDraftActive(false);
    setActiveEntryId(entry.id);
    setEntryError('');
    setSuccessMessage('');

    if (entry.user_id !== currentUserId) return;

    setComposer({
      projectId: entry.project_id,
      entryDate: entry.entry_date,
      startTime: entry.start_minutes != null ? `${String(Math.floor(entry.start_minutes / 60)).padStart(2, '0')}:${String(entry.start_minutes % 60).padStart(2, '0')}` : '09:00',
      durationMinutes: String(entry.duration_minutes || 60),
      description: entry.description || '',
    });
  }, [currentUserId]);

  const handleDuplicateEntry = useCallback((entry) => {
    if (!entry || entry.user_id !== currentUserId) return;

    setDuplicateDraftActive(true);
    setActiveEntryId('');
    setEntryError('');
    setSuccessMessage('Duplicate ready. Click a new slot in the week view, then save it as a new entry.');
    setSelectedProjectId(entry.project_id || 'all');
    setComposer({
      projectId: entry.project_id,
      entryDate: entry.entry_date,
      startTime: entry.start_minutes != null ? `${String(Math.floor(entry.start_minutes / 60)).padStart(2, '0')}:${String(entry.start_minutes % 60).padStart(2, '0')}` : '09:00',
      durationMinutes: String(entry.duration_minutes || 60),
      description: entry.description || '',
    });
  }, [currentUserId]);

  const handlePlaceDuplicateDraft = useCallback((entryDate, startMinutes) => {
    if (!duplicateDraftActive) return;

    setEntryError('');
    setSuccessMessage('Duplicate moved. Save to create the new entry.');
    setComposer((current) => ({
      ...current,
      entryDate,
      startTime: minutesToTimeInput(startMinutes),
    }));
  }, [duplicateDraftActive]);

  const handleSubmit = useCallback(async () => {
    if (!currentUserId || saving || !schemaReady) return;

    const payload = buildTimeEntryPayload({
      projectId: composer.projectId,
      userId: currentUserId,
      entryDate: composer.entryDate,
      startTime: composer.startTime,
      durationMinutes: composer.durationMinutes,
      description: composer.description,
    });

    if (!payload) {
      setEntryError('Choose a project, date, start time, and a duration in minutes before saving.');
      return;
    }

    const { start, endInclusive } = getWeekDateRange(weekStart);
    if (payload.entry_date < start || payload.entry_date > endInclusive) {
      setEntryError('Timesheet works week by week. Choose a date inside the visible week before saving.');
      return;
    }

    setSaving(true);
    setEntryError('');
    setSuccessMessage('');

    if (editingOwnEntry) {
      if (!isOnline || isOfflineTempId(activeEntry.id)) {
        const updatedEntry = {
          ...activeEntry,
          ...payload,
          updated_at: new Date().toISOString(),
        };
        const nextEntries = sortEntries(entries.map((entry) => (
          entry.id === activeEntry.id ? updatedEntry : entry
        )));
        const cachedState = loadTimesheetOfflineState(currentUserId);
        persistOfflineState({
          ...cachedState,
          entriesByWeek: {
            ...(cachedState.entriesByWeek || {}),
            [weekStart]: nextEntries,
          },
          queue: enqueueUpdate(cachedState.queue || [], activeEntry.id, {
            ...payload,
            updated_at: new Date().toISOString(),
          }),
          selectedProjectId,
          weekStart,
          viewMode,
        });
        setEntries(nextEntries);
        setSaving(false);
        setSuccessMessage('Timesheet entry saved offline. It will sync when your connection returns.');
        resetComposer();
        return;
      }

      const { error } = await supabase
        .from('time_entries')
        .update(payload)
        .eq('id', activeEntry.id)
        .eq('user_id', currentUserId);

      if (error) {
        setSaving(false);
        setEntryError('Unable to update this Timesheet entry right now.');
        return;
      }

      await loadEntries();
      setSaving(false);
      setSuccessMessage('Timesheet entry updated.');
      resetComposer();
      return;
    }

    if (!isOnline) {
      const localEntry = createOfflineTimeEntry({ payload });
      const nextEntries = sortEntries([...entries, localEntry]);
      const cachedState = loadTimesheetOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        entriesByWeek: {
          ...(cachedState.entriesByWeek || {}),
          [weekStart]: nextEntries,
        },
        queue: enqueueCreate(cachedState.queue || [], {
          localId: localEntry.id,
          payload,
        }),
        selectedProjectId,
        weekStart,
        viewMode,
      });
      setEntries(nextEntries);
      setSaving(false);
      setSuccessMessage('Timesheet entry saved offline. It will sync when your connection returns.');
      setDuplicateDraftActive(false);
      resetComposer();
      return;
    }

    const { error } = await supabase
      .from('time_entries')
      .insert(payload);

    if (error) {
      setSaving(false);
      setEntryError('Unable to save this Timesheet entry right now.');
      return;
    }

    await loadEntries();
    setSaving(false);
    setSuccessMessage('Timesheet entry added.');
    setDuplicateDraftActive(false);
    resetComposer();
  }, [activeEntry, composer, currentUserId, editingOwnEntry, entries, isOnline, loadEntries, persistOfflineState, resetComposer, saving, schemaReady, selectedProjectId, viewMode, weekStart]);

  const handleDeleteEntry = useCallback(async () => {
    if (!editingOwnEntry || !activeEntry?.id || deletingEntryId) return;

    setDeletingEntryId(activeEntry.id);
    setEntryError('');
    setSuccessMessage('');

    if (!isOnline || isOfflineTempId(activeEntry.id)) {
      const nextEntries = entries.filter((entry) => entry.id !== activeEntry.id);
      const cachedState = loadTimesheetOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        entriesByWeek: {
          ...(cachedState.entriesByWeek || {}),
          [weekStart]: nextEntries,
        },
        queue: enqueueDelete(cachedState.queue || [], activeEntry.id),
        selectedProjectId,
        weekStart,
        viewMode,
      });
      setEntries(nextEntries);
      setDeletingEntryId('');
      setSuccessMessage('Timesheet entry removed offline. The change will sync when your connection returns.');
      resetComposer();
      return;
    }

    const { error } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', activeEntry.id)
      .eq('user_id', currentUserId);

    if (error) {
      setDeletingEntryId('');
      setEntryError('Unable to delete this Timesheet entry right now.');
      return;
    }

    await loadEntries();
    setDeletingEntryId('');
    setSuccessMessage('Timesheet entry deleted.');
    resetComposer();
  }, [activeEntry, currentUserId, deletingEntryId, editingOwnEntry, entries, isOnline, loadEntries, persistOfflineState, resetComposer, selectedProjectId, viewMode, weekStart]);

  const handleDownloadReport = useCallback(async () => {
    if (downloadingReport || loadingProjects || loadingEntries || !schemaReady) return;

    setEntryError('');
    setSuccessMessage('');
    setDownloadingReport(true);

    try {
      const rows = buildTimesheetReportRows(visibleEntries, trackProjects);
      const XLSX = await loadXLSX();
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([TIMESHEET_REPORT_COLUMNS]);

      if (rows.length > 0) {
        XLSX.utils.sheet_add_json(worksheet, rows, {
          origin: 'A2',
          skipHeader: true,
        });
      }

      worksheet['!cols'] = [
        { wch: 14 },
        { wch: 28 },
        { wch: 12 },
        { wch: 48 },
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Timesheet Report');
      XLSX.writeFile(workbook, buildTimesheetReportFileName({
        weekStart,
        selectedProject,
        selectedProjectId,
        viewMode,
      }));

      setSuccessMessage(`Timesheet report downloaded${rows.length ? ` (${rows.length} ${rows.length === 1 ? 'row' : 'rows'})` : ''}.`);
    } catch (error) {
      console.error('Timesheet report export error:', error);
      setEntryError('Unable to download the Timesheet report right now.');
    } finally {
      setDownloadingReport(false);
    }
  }, [
    downloadingReport,
    loadingProjects,
    loadingEntries,
    schemaReady,
    visibleEntries,
    trackProjects,
    weekStart,
    selectedProject,
    selectedProjectId,
    viewMode,
  ]);
  const {
    syncingQueue,
    entrySyncStateById,
    offlineStatusLabel,
    syncCenterItems,
  } = useTimesheetOfflineSync({
    currentUserId,
    isOnline,
    loadTimesheetOfflineState,
    persistOfflineState,
    selectedProjectId,
    setEntries,
    sortEntries,
    offlineQueue,
    lastSyncedAt,
    weekStart,
    viewMode,
    visibleEntries,
    formatSyncTimeLabel,
  });

  return (
    <>
      <TimesheetPanel
        currentUserId={currentUserId}
        currentProject={currentProject}
        projects={trackProjects}
        recentProjects={recentProjects}
        weekStart={weekStart}
        onPreviousWeek={() => setWeekStart(toWeekStartIso(addWeeks(weekStart, -1)))}
        onNextWeek={() => setWeekStart(toWeekStartIso(addWeeks(weekStart, 1)))}
        onThisWeek={() => setWeekStart(toWeekStartIso(new Date()))}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
        selectedProject={selectedProject}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        activeEntry={activeEntry}
        duplicateDraft={duplicateDraft}
        visibleEntries={visibleEntries}
        summaryRows={summaryRows}
        totalMinutes={weeklyTotalMinutes}
        schemaReady={schemaReady}
        loading={loadingProjects || loadingEntries}
        saving={saving}
        downloadingReport={downloadingReport}
        deletingEntryId={deletingEntryId}
        projectLoadError={projectLoadError}
        entryError={entryError}
        successMessage={syncingQueue ? 'Syncing offline Timesheet changes…' : successMessage}
        offlineStatusLabel={offlineStatusLabel}
        offlineQueueCount={offlineQueue.length}
        entrySyncStateById={entrySyncStateById}
        composer={composer}
        onComposerChange={handleComposerChange}
        onSubmit={handleSubmit}
        onResetComposer={resetComposer}
        onDeleteEntry={handleDeleteEntry}
        onDownloadReport={handleDownloadReport}
        onSelectEntry={handleSelectEntry}
        onDuplicateEntry={handleDuplicateEntry}
        onPlaceDuplicateDraft={handlePlaceDuplicateDraft}
        onBackToProject={onBackToProject}
      />
      <MobileSyncCenter
        shouldShow={!isOnline || syncingQueue || offlineQueue.length > 0}
        title="Timesheet sync"
        summary={offlineStatusLabel}
        queueCount={offlineQueue.length}
        items={syncCenterItems}
      />
    </>
  );
}
