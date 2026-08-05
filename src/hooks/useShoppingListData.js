import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isLikelyNetworkError } from '../utils/connectivity';
import {
  applyShoppingQueueToTodos,
  hasCachedShoppingTodos,
  pickPreferredShoppingProject,
} from '../utils/shoppingListViewState';
import { createProjectWithLimits, getProjectCreationErrorMessage } from '../utils/projectCreation';

export function useShoppingListData({
  canCreateProject,
  createEmptyProjectSnapshot,
  currentUserId,
  generateProjectId,
  isMissingSchemaFieldError,
  isMissingTodoRelationError,
  isOnline,
  isProjectRelationMissingError,
  legacyManualTodoSelect,
  limits,
  loadShoppingOfflineState,
  loadShoppingOfflineStateAsync,
  manualTodoSelect,
  mapManualTodoRow,
  normalizeProjectRecord,
  persistOfflineState,
  refreshProjectCount,
  shoppingProjectName,
  shoppingExtraFields = [],
  sortTodos,
  supportsProjectMembersRef,
  ensuringProjectRef,
}) {
  const [initialCachedState] = useState(() => loadShoppingOfflineState(currentUserId));
  const initialSelectedProjectId = initialCachedState.selectedProjectId
    || initialCachedState.projects?.[0]?.id
    || '';
  const initialHasCachedTodos = hasCachedShoppingTodos(initialCachedState, initialSelectedProjectId);
  const initialTodos = applyShoppingQueueToTodos({
    todos: initialCachedState.todosByProject?.[initialSelectedProjectId] || [],
    queue: initialCachedState.queue || [],
    projectId: initialSelectedProjectId,
  });
  const [projects, setProjects] = useState(() => initialCachedState.projects || []);
  const [selectedProjectId, setSelectedProjectId] = useState(initialSelectedProjectId);
  const [loadingProjects, setLoadingProjects] = useState(() => !initialCachedState.projects?.length);
  const [projectError, setProjectError] = useState('');
  const [todos, setTodos] = useState(initialTodos);
  const [loadingTodos, setLoadingTodos] = useState(() => (
    Boolean(initialSelectedProjectId) && !initialHasCachedTodos
  ));
  const [todoError, setTodoError] = useState('');
  const [supportsShoppingFields, setSupportsShoppingFields] = useState(true);
  const [offlineStateHydrated, setOfflineStateHydrated] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    const cachedState = loadShoppingOfflineState(currentUserId);
    if (cachedState.projects?.length) {
      setProjects(cachedState.projects);
      setLoadingProjects(false);
    }
    const cachedSelectedProjectId = cachedState.selectedProjectId || cachedState.projects?.[0]?.id || '';
    if (cachedSelectedProjectId) {
      setSelectedProjectId((current) => current || cachedSelectedProjectId);
    }
    if (hasCachedShoppingTodos(cachedState, cachedSelectedProjectId)) {
      setTodos(applyShoppingQueueToTodos({
        todos: cachedState.todosByProject?.[cachedSelectedProjectId] || [],
        queue: cachedState.queue || [],
        projectId: cachedSelectedProjectId,
      }));
      setLoadingTodos(false);
    }

    let active = true;
    void loadShoppingOfflineStateAsync(currentUserId)
      .then((preferredState) => {
        if (!active || !preferredState) return;
        if (preferredState.projects?.length) {
          setProjects(preferredState.projects);
          setLoadingProjects(false);
        }
        const preferredProjectId = preferredState.selectedProjectId
          || preferredState.projects?.[0]?.id
          || '';
        if (preferredProjectId) {
          setSelectedProjectId((current) => current || preferredProjectId);
        }
        if (hasCachedShoppingTodos(preferredState, preferredProjectId)) {
          setTodos(applyShoppingQueueToTodos({
            todos: preferredState.todosByProject?.[preferredProjectId] || [],
            queue: preferredState.queue || [],
            projectId: preferredProjectId,
          }));
          setLoadingTodos(false);
        }
      })
      .finally(() => {
        if (active) setOfflineStateHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, loadShoppingOfflineState, loadShoppingOfflineStateAsync]);

  const createShoppingProject = useCallback(async () => {
    const { data, error } = await createProjectWithLimits({
      projectId: generateProjectId(),
      name: shoppingProjectName,
      snapshot: createEmptyProjectSnapshot(),
      isDemo: false,
    });

    if (error || !data) {
      throw new Error(getProjectCreationErrorMessage(error));
    }

    refreshProjectCount();
    return normalizeProjectRecord(data, currentUserId);
  }, [
    createEmptyProjectSnapshot,
    currentUserId,
    generateProjectId,
    normalizeProjectRecord,
    refreshProjectCount,
    shoppingProjectName,
  ]);

  const loadProjects = useCallback(async () => {
    if (!currentUserId) {
      setLoadingProjects(false);
      return;
    }

    setProjectError('');

    const localCachedState = loadShoppingOfflineState(currentUserId);
    const hasLocalProjects = Boolean(localCachedState.projects?.length);
    setLoadingProjects(!hasLocalProjects);
    if (hasLocalProjects) {
      setProjects(localCachedState.projects);
      const localSelectedProjectId = localCachedState.selectedProjectId
        || localCachedState.projects[0]?.id
        || '';
      if (localSelectedProjectId) {
        setSelectedProjectId((current) => current || localSelectedProjectId);
      }
    }

    const cachedState = await loadShoppingOfflineStateAsync(currentUserId);
    if (cachedState.projects?.length) {
      setProjects(cachedState.projects);
      setLoadingProjects(false);
      if (cachedState.selectedProjectId) {
        setSelectedProjectId((current) => current || cachedState.selectedProjectId);
      }
    }

    if (!isOnline) {
      if (!cachedState.projects?.length) {
        setProjectError('You are offline. Open Shopping List once online on this device to keep it available.');
      }
      setLoadingProjects(false);
      return;
    }

    let includeMembers = supportsProjectMembersRef.current;
    let { data, error } = await supabase
      .from('projects')
      .select(includeMembers
        ? 'id, user_id, name, created_at, updated_at, project_members(id, user_id, member_email, role, invited_by_user_id, created_at)'
        : 'id, user_id, name, created_at, updated_at')
      .eq('name', shoppingProjectName)
      .order('created_at', { ascending: true });

    if (error && includeMembers && isProjectRelationMissingError(error, 'project_members')) {
      supportsProjectMembersRef.current = false;
      includeMembers = false;
      ({ data, error } = await supabase
        .from('projects')
        .select('id, user_id, name, created_at, updated_at')
        .eq('name', shoppingProjectName)
        .order('created_at', { ascending: true }));
    }

    if (error) {
      if (isLikelyNetworkError(error, { online: isOnline })) {
        if (cachedState.projects?.length) {
          setProjects(cachedState.projects);
          if (cachedState.selectedProjectId) {
            setSelectedProjectId(cachedState.selectedProjectId);
          }
        } else {
          setProjectError('The connection is unavailable. Open Shopping List once online on this device to keep it available.');
        }
        setLoadingProjects(false);
        return;
      }
      setProjects([]);
      setProjectError(error.message || 'Unable to load Shopping List.');
      setLoadingProjects(false);
      return;
    }

    let nextProjects = (data || []).map((project) => normalizeProjectRecord(project, currentUserId));

    if (nextProjects.length === 0 && canCreateProject && !ensuringProjectRef.current) {
      ensuringProjectRef.current = true;
      try {
        const createdProject = await createShoppingProject();
        nextProjects = createdProject ? [createdProject] : [];
      } catch (createError) {
        setProjectError(createError.message || 'Unable to prepare Shopping List.');
      } finally {
        ensuringProjectRef.current = false;
      }
    } else if (nextProjects.length === 0 && !canCreateProject) {
      setProjectError(
        `Shopping List needs one project slot. Your ${limits.label} plan currently allows ${limits.maxProjects} project${limits.maxProjects === 1 ? '' : 's'}.`
      );
    }

    const defaultProject = pickPreferredShoppingProject(nextProjects, currentUserId) || nextProjects[0] || null;

    setProjects(nextProjects);
    setSelectedProjectId((currentValue) => (
      currentValue && nextProjects.some((project) => project.id === currentValue)
        ? currentValue
        : (defaultProject?.id || '')
    ));
    setLoadingProjects(false);
    persistOfflineState({
      ...cachedState,
      projects: nextProjects,
      selectedProjectId: defaultProject?.id || cachedState.selectedProjectId || '',
    });
  }, [
    canCreateProject,
    createShoppingProject,
    currentUserId,
    ensuringProjectRef,
    isOnline,
    isProjectRelationMissingError,
    limits.label,
    limits.maxProjects,
    loadShoppingOfflineStateAsync,
    loadShoppingOfflineState,
    normalizeProjectRecord,
    persistOfflineState,
    shoppingProjectName,
    supportsProjectMembersRef,
  ]);

  const loadTodos = useCallback(async () => {
    if (!selectedProject?.id) {
      setTodos([]);
      setLoadingTodos(false);
      return;
    }

    setTodoError('');

    const localCachedState = loadShoppingOfflineState(currentUserId);
    let hasCachedTodos = hasCachedShoppingTodos(localCachedState, selectedProject.id);
    let cachedVisibleTodos = applyShoppingQueueToTodos({
      todos: localCachedState.todosByProject?.[selectedProject.id] || [],
      queue: localCachedState.queue || [],
      projectId: selectedProject.id,
    });
    setLoadingTodos(!hasCachedTodos);
    if (hasCachedTodos) {
      setTodos(cachedVisibleTodos);
    }

    const cachedState = await loadShoppingOfflineStateAsync(currentUserId);
    const cachedTodos = cachedState.todosByProject?.[selectedProject.id] || [];
    const durableVisibleTodos = applyShoppingQueueToTodos({
      todos: cachedTodos,
      queue: cachedState.queue || [],
      projectId: selectedProject.id,
    });
    if (hasCachedShoppingTodos(cachedState, selectedProject.id)) {
      hasCachedTodos = true;
      cachedVisibleTodos = durableVisibleTodos;
      setTodos(durableVisibleTodos);
      setLoadingTodos(false);
    }

    if (!isOnline) {
      if (!hasCachedTodos) {
        setTodoError('You are offline. Open this list once online on this device to cache it.');
      }
      setLoadingTodos(false);
      return;
    }

    let selectClause = supportsShoppingFields ? manualTodoSelect : legacyManualTodoSelect;
    let { data, error } = await supabase
      .from('manual_todos')
      .select(selectClause)
      .eq('project_id', selectedProject.id)
      .order('status', { ascending: true })
      .order('created_at', { ascending: true });

    if (error && supportsShoppingFields && isMissingSchemaFieldError(error, shoppingExtraFields)) {
      setSupportsShoppingFields(false);
      selectClause = legacyManualTodoSelect;
      ({ data, error } = await supabase
        .from('manual_todos')
        .select(selectClause)
        .eq('project_id', selectedProject.id)
        .order('status', { ascending: true })
        .order('created_at', { ascending: true }));
    }

    if (error) {
      if (isLikelyNetworkError(error, { online: isOnline })) {
        if (hasCachedTodos) {
          setTodos(cachedVisibleTodos);
        } else {
          setTodoError('The connection is unavailable. Open this list once online on this device to cache it.');
        }
        setLoadingTodos(false);
        return;
      }
      if (isMissingTodoRelationError(error, 'manual_todos')) {
        setTodoError('Shopping items need the manual to-dos table enabled first.');
      } else {
        setTodoError(error.message || 'Unable to load grocery items.');
      }
      setTodos([]);
      setLoadingTodos(false);
      return;
    }

    const serverTodos = sortTodos((data || []).map(mapManualTodoRow));
    const nextTodos = applyShoppingQueueToTodos({
      todos: serverTodos,
      queue: cachedState.queue || [],
      projectId: selectedProject.id,
    });
    setTodos(nextTodos);
    persistOfflineState({
      ...cachedState,
      selectedProjectId: selectedProject.id,
      todosByProject: {
        ...(cachedState.todosByProject || {}),
        [selectedProject.id]: nextTodos,
      },
      lastSyncedAt: new Date().toISOString(),
    });
    setLoadingTodos(false);
  }, [
    currentUserId,
    isMissingSchemaFieldError,
    isMissingTodoRelationError,
    isOnline,
    legacyManualTodoSelect,
    loadShoppingOfflineStateAsync,
    loadShoppingOfflineState,
    manualTodoSelect,
    mapManualTodoRow,
    persistOfflineState,
    selectedProject?.id,
    shoppingExtraFields,
    sortTodos,
    supportsShoppingFields,
  ]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos]);

  return {
    loadProjects,
    loadTodos,
    loadingProjects,
    loadingTodos,
    offlineStateHydrated,
    projectError,
    projects,
    selectedProject,
    selectedProjectId,
    setProjectError,
    setSelectedProjectId,
    setTodoError,
    setTodos,
    todoError,
    todos,
  };
}
