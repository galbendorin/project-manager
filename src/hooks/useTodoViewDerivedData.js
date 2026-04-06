import { useCallback, useMemo } from 'react';
import {
  filterBySearch,
  collectDerivedTodos,
} from '../utils/helpers';
import {
  matchesOwnerSelection,
  matchesProjectSelection,
  matchesRecurrenceSelection,
  matchesSourceSelection,
} from '../utils/todoFilterUtils';

const sourceFilterKeyForItem = (item) => {
  if (!item.isDerived) return 'manual';
  if (item.source === 'Action Log') return 'action';
  if (item.source === 'Issue Log') return 'issue';
  if (item.source === 'Change Log') return 'change';
  if (item.source === 'Master Tracker') return 'tracker';
  if (item.source === 'Project Plan') return 'plan';
  return 'derived';
};

export function useTodoViewDerivedData({
  allProjectsData,
  bucketFilter,
  currentProject,
  isExternalView,
  ownerFilter,
  pendingCompletedTodos,
  projectData,
  projectFilter,
  projectOptions,
  recurrenceFilter,
  registers,
  scope,
  searchQuery,
  sourceFilter,
  todos,
  tracker,
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
      } else {
        allProjects.push(currentPayload);
      }
    }

    return allProjects;
  }, [scope, allProjectsData, currentProject?.id, currentProject?.name, projectData, registers, tracker]);

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
    const manualTodos = (todos || []).map((item) => ({
      ...item,
      isDerived: false,
      source: 'Manual',
      projectId: item.projectId || null,
      projectName: item.projectId ? (projectNameMap.get(item.projectId) || 'Unknown Project') : 'Other',
      public: true,
    }));

    if (scope === 'all') return manualTodos;

    return manualTodos.filter((item) => {
      if (!currentProject?.id) return item.projectId === null;
      return item.projectId === currentProject.id || item.projectId === null;
    });
  }, [todos, scope, currentProject?.id, projectNameMap]);

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
    const hiddenIds = new Set(Object.keys(pendingCompletedTodos));
    return filteredOpenTodos.filter((item) => !hiddenIds.has(item._id));
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
    mergedOpenTodos,
    ownerOptions,
    projectSelectOptions,
    visibleOpenTodos,
  };
}
