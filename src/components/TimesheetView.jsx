import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import TimesheetPanel from './TimesheetPanel';
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

const isMissingColumnError = (error, columnName) => {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return message.includes(columnName.toLowerCase()) && message.includes('column');
};

const isMissingRelationError = (error, relationName) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes(relationName.toLowerCase()) && (message.includes('relation') || message.includes('relationship'));
};

const isSchemaMissingError = (error) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes('does not exist')
    || message.includes('could not find')
    || message.includes('relation')
    || message.includes('column');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getTodayIso = () => new Date().toISOString().slice(0, 10);

const getDefaultDateForWeek = (weekStart) => {
  const { start, endInclusive } = getWeekDateRange(weekStart);
  const today = getTodayIso();
  if (today >= start && today <= endInclusive) return today;
  return start;
};

const createDefaultComposer = (projectId = '', weekStart = toWeekStartIso(new Date())) => ({
  projectId,
  entryDate: getDefaultDateForWeek(weekStart),
  startTime: '09:00',
  durationMinutes: '60',
  description: '',
});

export default function TimesheetView({
  currentUserId,
  currentProject = null,
  onBackToProject,
}) {
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
  const [weekStart, setWeekStart] = useState(() => toWeekStartIso(new Date()));
  const initialProjectId = currentProject?.is_demo ? '' : (currentProject?.id || '');
  const [selectedProjectId, setSelectedProjectId] = useState(() => initialProjectId || 'all');
  const [viewMode, setViewMode] = useState('mine');
  const [activeEntryId, setActiveEntryId] = useState('');
  const [duplicateDraftActive, setDuplicateDraftActive] = useState(false);
  const [composer, setComposer] = useState(() => createDefaultComposer(initialProjectId, toWeekStartIso(new Date())));

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

  const loadProjects = useCallback(async () => {
    if (!currentUserId) return;

    setLoadingProjects(true);
    setProjectLoadError('');

    const queryProjects = async () => {
      let includeMembers = true;
      let includeIsDemo = true;
      let data = null;
      let error = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const selectFields = [
          'id',
          'user_id',
          'name',
          includeIsDemo ? 'is_demo' : null,
          'created_at',
          'updated_at',
          includeMembers ? 'project_members(id, user_id, member_email, role, invited_by_user_id, created_at)' : null,
        ].filter(Boolean).join(', ');

        const response = await supabase
          .from('projects')
          .select(selectFields)
          .order('updated_at', { ascending: false });

        data = response.data;
        error = response.error;

        if (!error) break;

        let shouldRetry = false;
        if (includeMembers && isMissingRelationError(error, 'project_members')) {
          includeMembers = false;
          shouldRetry = true;
        }
        if (includeIsDemo && isMissingColumnError(error, 'is_demo')) {
          includeIsDemo = false;
          shouldRetry = true;
        }
        if (!shouldRetry) break;
      }

      return { data, error };
    };

    let { data, error } = await queryProjects();

    if (error || !data) {
      await sleep(1000);
      const retry = await queryProjects();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      setProjectLoadError('Unable to load accessible projects for Timesheet right now.');
      setProjects([]);
      setLoadingProjects(false);
      return;
    }

    setProjects((data || []).map((project) => normalizeProjectRecord(project, currentUserId)));
    setLoadingProjects(false);
  }, [currentUserId]);

  const loadEntries = useCallback(async () => {
    if (!currentUserId) return;

    const { start, endInclusive } = getWeekDateRange(weekStart);
    setLoadingEntries(true);
    setEntryError('');
    setSuccessMessage('');

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
    setEntries(data || []);
    setLoadingEntries(false);
  }, [currentUserId, weekStart]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

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
  }, [currentProject?.id, editingOwnEntry, selectedProjectId, weekStart]);

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
  }, [activeEntry, composer, currentUserId, editingOwnEntry, loadEntries, resetComposer, saving, schemaReady]);

  const handleDeleteEntry = useCallback(async () => {
    if (!editingOwnEntry || !activeEntry?.id || deletingEntryId) return;

    setDeletingEntryId(activeEntry.id);
    setEntryError('');
    setSuccessMessage('');

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
  }, [activeEntry?.id, currentUserId, deletingEntryId, editingOwnEntry, loadEntries, resetComposer]);

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

  return (
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
      successMessage={successMessage}
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
  );
}
