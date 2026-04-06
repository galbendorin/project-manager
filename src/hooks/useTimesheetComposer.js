import { useCallback, useEffect, useMemo } from 'react';
import {
  buildProjectDurationSummary,
  getWeekDateRange,
  minutesToTimeInput,
  parseTimeInputToMinutes,
  sumEntryDurationMinutes,
} from '../utils/timesheets';
import {
  createDefaultComposer,
  getDefaultDateForWeek,
} from '../utils/timesheetViewState';

export function useTimesheetComposer({
  activeEntryId,
  composer,
  currentProject,
  currentUserId,
  duplicateDraftActive,
  entries,
  selectedProject,
  selectedProjectId,
  setActiveEntryId,
  setComposer,
  setDuplicateDraftActive,
  setEntryError,
  setSelectedProjectId,
  setSuccessMessage,
  setViewMode,
  trackProjects,
  viewMode,
  weekStart,
}) {
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
    if (currentProject?.id && !currentProject?.is_demo) {
      setSelectedProjectId(currentProject.id);
      setComposer((current) => ({
        ...current,
        projectId: current.projectId || currentProject.id,
      }));
      return;
    }

    setSelectedProjectId((current) => current || 'all');
  }, [currentProject?.id, currentProject?.is_demo, setComposer, setSelectedProjectId]);

  useEffect(() => {
    if (selectedProjectId !== 'all' && !trackProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId('all');
    }
  }, [trackProjects, selectedProjectId, setSelectedProjectId]);

  useEffect(() => {
    if (selectedProjectId === 'all' || selectedProject?.isOwned) return;
    if (viewMode !== 'mine') {
      setViewMode('mine');
    }
  }, [selectedProjectId, selectedProject?.isOwned, setViewMode, viewMode]);

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
  }, [currentProject?.id, currentProject?.is_demo, editingOwnEntry, selectedProjectId, setComposer, weekStart]);

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
  }, [setComposer, setEntryError, setSuccessMessage]);

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
  }, [
    currentProject?.id,
    currentProject?.is_demo,
    selectedProjectId,
    setActiveEntryId,
    setComposer,
    setDuplicateDraftActive,
    setEntryError,
    setSuccessMessage,
    weekStart,
  ]);

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
  }, [setActiveEntryId, setComposer, setEntryError, setSelectedProjectId, setSuccessMessage]);

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
  }, [currentUserId, setActiveEntryId, setComposer, setDuplicateDraftActive, setEntryError, setSuccessMessage]);

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
  }, [currentUserId, setActiveEntryId, setComposer, setDuplicateDraftActive, setEntryError, setSelectedProjectId, setSuccessMessage]);

  const handlePlaceDuplicateDraft = useCallback((entryDate, startMinutes) => {
    if (!duplicateDraftActive) return;

    setEntryError('');
    setSuccessMessage('Duplicate moved. Save to create the new entry.');
    setComposer((current) => ({
      ...current,
      entryDate,
      startTime: minutesToTimeInput(startMinutes),
    }));
  }, [duplicateDraftActive, setComposer, setEntryError, setSuccessMessage]);

  return {
    activeEntry,
    duplicateDraft,
    editingOwnEntry,
    handleComposerChange,
    handleDuplicateEntry,
    handlePlaceDuplicateDraft,
    handleSelectEntry,
    handleSelectProject,
    recentProjects,
    resetComposer,
    summaryRows,
    visibleEntries,
    weeklyTotalMinutes,
  };
}
