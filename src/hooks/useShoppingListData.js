import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isLikelyNetworkError } from '../utils/connectivity';
import {
  applyShoppingQueueToTodos,
  hasCachedShoppingTodos,
  pickPreferredShoppingProject,
} from '../utils/shoppingListViewState';
import { createProjectWithLimits, getProjectCreationErrorMessage } from '../utils/projectCreation';

const cacheVersion = (state, projectId) => JSON.stringify([
  state.todosByProject?.[projectId] || [], state.queue || [],
]);

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
  const [selectedProjectId, setSelectedProjectIdState] = useState(initialSelectedProjectId);
  const [loadingProjects, setLoadingProjects] = useState(() => !initialCachedState.projects?.length);
  const [projectError, setProjectError] = useState('');
  const [todos, setTodos] = useState(initialTodos);
  const [loadingTodos, setLoadingTodos] = useState(() => (
    Boolean(initialSelectedProjectId) && !initialHasCachedTodos
  ));
  const [todoError, setTodoError] = useState('');
  const [supportsShoppingFields, setSupportsShoppingFields] = useState(true);
  const [offlineStateHydrated, setOfflineStateHydrated] = useState(false);
  const reads = useRef({ projects: 0, todos: 0, epoch: 0, active: true });
  const localRevision = useRef(0);
  const pendingMutations = useRef(new Map());
  const context = useRef({ user: currentUserId, project: selectedProjectId });
  if (context.current.user !== currentUserId || context.current.project !== selectedProjectId) {
    if (context.current.user !== currentUserId) reads.current.epoch += 1;
    reads.current.todos += 1;
    context.current = { user: currentUserId, project: selectedProjectId };
  }
  useEffect(() => {
    const state = reads.current;
    state.active = true;
    return () => { state.active = false; state.epoch += 1; };
  }, []);

  // External optimistic edits and successful writes invalidate older reads even
  // after their queue entry has drained. Hook-owned refreshes use setTodos directly.
  const setLocalTodos = useCallback((next) => {
    if (context.current.user !== currentUserId || context.current.project !== selectedProjectId) return;
    localRevision.current += 1;
    setTodos(next);
  }, [currentUserId, selectedProjectId]);

  const beginTodoMutation = useCallback(() => {
    const projectId = selectedProjectId;
    pendingMutations.current.set(projectId, (pendingMutations.current.get(projectId) || 0) + 1);
    reads.current.todos += 1;
    localRevision.current += 1;
    if (context.current.project === projectId) setLoadingTodos(false);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      pendingMutations.current.set(projectId, Math.max(0, (pendingMutations.current.get(projectId) || 1) - 1));
      localRevision.current += 1;
    };
  }, [selectedProjectId]);

  const setSelectedProjectId = useCallback((value) => {
    if (context.current.user !== currentUserId) return;
    const next = typeof value === 'function' ? value(context.current.project) : value;
    if (next === context.current.project) return;
    reads.current.todos += 1;
    context.current.project = next;
    const cached = loadShoppingOfflineState(currentUserId);
    // Selection and its rows change together, so the view's cache effect cannot
    // persist the previous list's rows under the newly selected project ID.
    setTodos(applyShoppingQueueToTodos({
      todos: cached.todosByProject?.[next] || [], queue: cached.queue || [], projectId: next,
    }));
    setTodoError('');
    setLoadingTodos(Boolean(next) && !hasCachedShoppingTodos(cached, next));
    setSelectedProjectIdState(next);
  }, [currentUserId, loadShoppingOfflineState]);

  // Durable-create confirmations and ordinary list reads share one acceptance
  // fence. A late confirmation must not erase a newer existing-item edit.
  const beginTodoRefresh = useCallback((projectId) => {
    if (!reads.current.active || context.current.user !== currentUserId
      || context.current.project !== projectId || pendingMutations.current.get(projectId)) return null;
    setLoadingTodos(false);
    const request = ++reads.current.todos;
    const epoch = reads.current.epoch;
    const revision = localRevision.current;
    const version = cacheVersion(loadShoppingOfflineState(currentUserId), projectId);
    return () => reads.current.active && reads.current.todos === request
      && reads.current.epoch === epoch && context.current.user === currentUserId
      && context.current.project === projectId && localRevision.current === revision
      && !pendingMutations.current.get(projectId)
      && cacheVersion(loadShoppingOfflineState(currentUserId), projectId) === version;
  }, [currentUserId, loadShoppingOfflineState]);

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
    const epoch = reads.current.epoch;
    const revision = localRevision.current;
    const version = JSON.stringify(cachedState);
    void loadShoppingOfflineStateAsync(currentUserId)
      .then((preferredState) => {
        if (!active || !preferredState || epoch !== reads.current.epoch
          || revision !== localRevision.current
          || version !== JSON.stringify(loadShoppingOfflineState(currentUserId))) return;
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
        const activeProjectId = context.current.project;
        persistOfflineState({ ...preferredState, selectedProjectId: activeProjectId });
        if (hasCachedShoppingTodos(preferredState, activeProjectId)) {
          setTodos(applyShoppingQueueToTodos({
            todos: preferredState.todosByProject?.[activeProjectId] || [],
            queue: preferredState.queue || [],
            projectId: activeProjectId,
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
  }, [currentUserId, loadShoppingOfflineState, loadShoppingOfflineStateAsync, persistOfflineState, setSelectedProjectId]);

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
    if (!reads.current.active || context.current.user !== currentUserId) return;
    if (!currentUserId) {
      setLoadingProjects(false);
      return;
    }

    const request = ++reads.current.projects;
    const epoch = reads.current.epoch;
    const current = () => reads.current.active && reads.current.projects === request
      && reads.current.epoch === epoch && context.current.user === currentUserId;

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

    const hydrated = await loadShoppingOfflineStateAsync(currentUserId);
    if (!current()) return;
    let cachedState = loadShoppingOfflineState(currentUserId);
    if (JSON.stringify(cachedState) === JSON.stringify(localCachedState)) {
      cachedState = hydrated;
      persistOfflineState(cachedState);
    }
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

    if (!current()) return;

    if (error && includeMembers && isProjectRelationMissingError(error, 'project_members')) {
      supportsProjectMembersRef.current = false;
      includeMembers = false;
      ({ data, error } = await supabase
        .from('projects')
        .select('id, user_id, name, created_at, updated_at')
        .eq('name', shoppingProjectName)
        .order('created_at', { ascending: true }));
      if (!current()) return;
    }

    cachedState = loadShoppingOfflineState(currentUserId);

    if (error) {
      if (isLikelyNetworkError(error, { online: isOnline })) {
        if (cachedState.projects?.length) {
          setProjects(cachedState.projects);
          if (cachedState.selectedProjectId) {
            setSelectedProjectId(currentValue => currentValue || cachedState.selectedProjectId);
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
        if (!current()) return;
        nextProjects = createdProject ? [createdProject] : [];
      } catch (createError) {
        if (!current()) return;
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

    cachedState = loadShoppingOfflineState(currentUserId);

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
      selectedProjectId: nextProjects.some(project => project.id === context.current.project)
        ? context.current.project : (defaultProject?.id || ''),
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
    setSelectedProjectId,
  ]);

  const loadTodos = useCallback(async () => {
    if (!reads.current.active || context.current.user !== currentUserId
      || context.current.project !== selectedProjectId) return;
    if (pendingMutations.current.get(selectedProject?.id)) return;
    const request = ++reads.current.todos;
    const epoch = reads.current.epoch;
    const current = () => reads.current.active && reads.current.todos === request
      && reads.current.epoch === epoch && context.current.user === currentUserId
      && context.current.project === selectedProject?.id;
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

    const hydrationRevision = localRevision.current;
    const hydrated = await loadShoppingOfflineStateAsync(currentUserId);
    if (!current()) return;
    if (hydrationRevision !== localRevision.current) { setLoadingTodos(false); return; }
    let cachedState = loadShoppingOfflineState(currentUserId);
    // Promote a durable fallback only while the scope and synchronous base are
    // unchanged, including its queue; later refreshes must see the same intent.
    if (JSON.stringify(cachedState) === JSON.stringify(localCachedState)) {
      cachedState = hydrated;
      persistOfflineState(cachedState);
    }
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

    const revision = localRevision.current;
    const version = cacheVersion(loadShoppingOfflineState(currentUserId), selectedProject.id);
    let selectClause = supportsShoppingFields ? manualTodoSelect : legacyManualTodoSelect;
    let { data, error } = await supabase
      .from('manual_todos')
      .select(selectClause)
      .eq('project_id', selectedProject.id)
      .order('status', { ascending: true })
      .order('created_at', { ascending: true });

    if (!current()) return;

    if (error && supportsShoppingFields && isMissingSchemaFieldError(error, shoppingExtraFields)) {
      setSupportsShoppingFields(false);
      selectClause = legacyManualTodoSelect;
      ({ data, error } = await supabase
        .from('manual_todos')
        .select(selectClause)
        .eq('project_id', selectedProject.id)
        .order('status', { ascending: true })
        .order('created_at', { ascending: true }));
      if (!current()) return;
    }

    cachedState = loadShoppingOfflineState(currentUserId);
    const changed = revision !== localRevision.current
      || version !== cacheVersion(cachedState, selectedProject.id);
    if (changed) {
      // An old success or failure cannot establish the result of newer work.
      // Leave the current optimistic UI alone; a subsequent refresh can apply.
      setLoadingTodos(false);
      return;
    }

    if (error) {
      if (isLikelyNetworkError(error, { online: isOnline })) {
        if (hasCachedTodos) {
          setTodos(applyShoppingQueueToTodos({
            todos: cachedState.todosByProject?.[selectedProject.id] || cachedVisibleTodos,
            queue: cachedState.queue || [], projectId: selectedProject.id,
          }));
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
      lastSyncedAt: cachedState.queue?.length ? cachedState.lastSyncedAt : new Date().toISOString(),
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
    selectedProjectId,
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
    beginTodoMutation,
    beginTodoRefresh,
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
    setTodos: setLocalTodos,
    todoError,
    todos,
  };
}
