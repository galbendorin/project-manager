import { useCallback, useMemo } from 'react';
import { taskViewIdentity } from '../utils/todoEisenhower';
import {
  filterBySearch,
  collectDerivedTodos,
  getCurrentDate,
} from '../utils/helpers';
import {
  matchesOwnerSelection,
  matchesProjectSelection,
  matchesRecurrenceSelection,
  matchesSourceSelection,
} from '../utils/todoFilterUtils';
import {
  getTodoFocusCounts,
  matchesTodoFocusView,
  mergeManualTodoCollections,
} from '../utils/todoCommandCentre';

const sourceFilterKeyForItem = (item) => {
  if (!item.isDerived) return 'manual';
  if (item.source === 'Action Log') return 'action';
  if (item.source === 'Issue Log') return 'issue';
  if (item.source === 'Change Log') return 'change';
  if (item.source === 'Master Tracker') return 'tracker';
  if (item.source === 'Project Plan') return 'plan';
  return 'derived';
};

export function useTodoCandidateData({
  allProjectManualTodos,
  allProjectsData,
  currentProject,
  projectData,
  projectOptions,
  registers,
  scope,
  todos,
  tracker,
  sourcesConfirmed = false,
}) {
  const projectsForDerived = useMemo(() => {
    if (scope !== 'all') {
      return [{
        id: currentProject?.id || null,
        name: currentProject?.name || 'Current Project',
        tasks: projectData || [],
        registers: registers || {},
        tracker: tracker || [],
      }];
    }

    const allProjects = [...allProjectsData];
    if (currentProject?.id) {
      const idx = allProjects.findIndex((project) => project.id === currentProject.id);
      const currentPayload = {
        id: currentProject.id,
        name: currentProject.name,
        tasks: projectData || [],
        registers: registers || {},
        tracker: tracker || [],
      };
      if (idx >= 0) {
        allProjects[idx] = currentPayload;
      } else if (!sourcesConfirmed) {
        allProjects.push(currentPayload);
      }
    }

    return allProjects;
  }, [scope, allProjectsData, currentProject?.id, currentProject?.name, projectData, registers, tracker, sourcesConfirmed]);

  const projectNameMap = useMemo(() => {
    const map = new Map();
    projectOptions.forEach((project) => {
      map.set(project.id, project.name);
    });
    if (currentProject?.id && currentProject?.name) {
      map.set(currentProject.id, currentProject.name);
    }
    return map;
  }, [projectOptions, currentProject?.id, currentProject?.name]);

  const manualTodosByScope = useMemo(() => {
    const sourceTodos = scope === 'all'
      ? mergeManualTodoCollections(allProjectManualTodos, todos)
      : (todos || []);
    const manualTodos = sourceTodos.map((item) => ({
      ...item,
      isDerived: false,
      source: 'Manual',
      projectId: item.projectId || null,
      projectName: item.projectId ? (projectNameMap.get(item.projectId) || 'Unknown Project') : 'Other',
      public: true,
    }));

    if (scope === 'all') {
      const permitted = new Set(allProjectsData.map((project) => project.id));
      return sourcesConfirmed ? manualTodos.filter((todo) => !todo.projectId || permitted.has(todo.projectId)) : manualTodos;
    }

    return manualTodos.filter((item) => {
      if (!currentProject?.id) return item.projectId === null;
      return item.projectId === currentProject.id || item.projectId === null;
    });
  }, [allProjectManualTodos, todos, scope, currentProject?.id, projectNameMap, allProjectsData, sourcesConfirmed]);

  const derivedTodosByScope = useMemo(() => (
    projectsForDerived.flatMap((project) => {
      const derived = collectDerivedTodos(project.tasks, project.registers, project.tracker);
      return derived.map((item) => ({
        ...item,
        projectId: project.id || null,
        projectName: project.id ? (project.name || projectNameMap.get(project.id) || 'Unknown Project') : 'Other',
      }));
    })
  ), [projectNameMap, projectsForDerived]);

  const mergedOpenTodos = useMemo(() => {
    const merged = [...manualTodosByScope, ...derivedTodosByScope];
    return merged.filter((item) => item.status !== 'Done');
  }, [manualTodosByScope, derivedTodosByScope]);

  return { manualTodosByScope, derivedTodosByScope, mergedOpenTodos };
}

export function useTodoViewDerivedData({
  candidates,
  bucketFilter,
  currentProject,
  currentUserId,
  currentUserName,
  focusView,
  isExternalView,
  ownerFilter,
  pendingCompletedTodos,
  projectFilter,
  projectOptions,
  recurrenceFilter,
  scope,
  searchQuery,
  sourceFilter,
  preferences = {},
  today = getCurrentDate(),
}) {
  const { manualTodosByScope, derivedTodosByScope, mergedOpenTodos } = candidates;

  const focusCounts = useMemo(() => getTodoFocusCounts(mergedOpenTodos, {
    currentUserId,
    currentUserName,
    today,
    preferences,
  }), [currentUserId, currentUserName, mergedOpenTodos, today, preferences]);

  const allTodoItems = useMemo(
    () => [...manualTodosByScope, ...derivedTodosByScope],
    [derivedTodosByScope, manualTodosByScope]
  );

  const ownerOptions = useMemo(() => {
    const values = new Set();
    mergedOpenTodos.forEach((item) => {
      if (item.owner) values.add(item.owner);
    });
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((owner) => ({ value: owner, label: owner }));
  }, [mergedOpenTodos]);

  const applyTodoFilters = useCallback((items) => {
    let nextItems = [...(items || [])];

    nextItems = nextItems.filter((item) => matchesProjectSelection(projectFilter, item));
    nextItems = nextItems.filter((item) => matchesSourceSelection(sourceFilter, item, sourceFilterKeyForItem));
    nextItems = nextItems.filter((item) => matchesOwnerSelection(ownerFilter, item));
    nextItems = nextItems.filter((item) => matchesRecurrenceSelection(recurrenceFilter, item));
    nextItems = nextItems.filter((item) => matchesTodoFocusView(item, focusView, {
      currentUserId,
      currentUserName,
      today,
      preferences,
    }));
    nextItems = filterBySearch(nextItems, searchQuery);

    if (isExternalView) {
      nextItems = nextItems.filter((item) => item.public !== false);
    }

    return nextItems;
  }, [
    ownerFilter,
    projectFilter,
    recurrenceFilter,
    searchQuery,
    sourceFilter,
    isExternalView,
    focusView,
    currentUserId,
    currentUserName,
    today,
    preferences,
  ]);

  const filteredOpenTodos = useMemo(
    () => applyTodoFilters(mergedOpenTodos),
    [applyTodoFilters, mergedOpenTodos]
  );

  const filteredTransientTodos = useMemo(
    () => Object.values(pendingCompletedTodos).filter((entry) => applyTodoFilters([entry.todo]).length > 0),
    [applyTodoFilters, pendingCompletedTodos]
  );

  const visibleOpenTodos = useMemo(() => {
    const hiddenIds = new Set(Object.values(pendingCompletedTodos).map(entry=>taskViewIdentity(entry.todo)));
    return filteredOpenTodos.filter((item) => !hiddenIds.has(taskViewIdentity(item)));
  }, [filteredOpenTodos, pendingCompletedTodos]);

  const projectSelectOptions = useMemo(() => {
    if (scope === 'project') {
      return [
        ...(currentProject?.id
          ? [{ value: currentProject.id, label: currentProject.name || 'Current Project' }]
          : []),
        { value: 'other', label: 'Other' },
      ];
    }

    const options = [{ value: 'other', label: 'Other' }];
    projectOptions.forEach((project) => {
      options.push({ value: project.id, label: project.name });
    });
    return options;
  }, [scope, projectOptions, currentProject?.id, currentProject?.name]);

  const activeFilterCount = useMemo(() => (
    [projectFilter, sourceFilter, ownerFilter, recurrenceFilter, bucketFilter]
      .reduce((count, values) => count + (values.length > 0 ? 1 : 0), 0)
  ), [bucketFilter, ownerFilter, projectFilter, recurrenceFilter, sourceFilter]);

  return {
    activeFilterCount,
    allTodoItems,
    filteredTransientTodos,
    focusCounts,
    mergedOpenTodos,
    ownerOptions,
    projectSelectOptions,
    visibleOpenTodos,
  };
}
