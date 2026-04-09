import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useShoppingListData({
  canCreateProject,
  createEmptyProjectSnapshot,
  currentUserId,
  generateProjectId,
  isMissingSchemaFieldError,
  isMissingTodoRelationError,
  isOnline,
  isProjectRelationMissingError,
  isRowLevelSecurityError,
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
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState('');
  const [todos, setTodos] = useState([]);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [todoError, setTodoError] = useState('');
  const [supportsShoppingFields, setSupportsShoppingFields] = useState(true);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    const cachedState = loadShoppingOfflineState(currentUserId);
    if (cachedState.projects?.length) {
      setProjects(cachedState.projects);
    }
    if (cachedState.selectedProjectId) {
      setSelectedProjectId((current) => current || cachedState.selectedProjectId);
    }

    let active = true;
    void loadShoppingOfflineStateAsync(currentUserId).then((preferredState) => {
      if (!active || !preferredState) return;
      if (preferredState.projects?.length) {
        setProjects(preferredState.projects);
      }
      if (preferredState.selectedProjectId) {
        setSelectedProjectId((current) => current || preferredState.selectedProjectId);
      }
    });

    return () => {
      active = false;
    };
  }, [currentUserId, loadShoppingOfflineState, loadShoppingOfflineStateAsync]);

  const createShoppingProject = useCallback(async () => {
    const projectPayload = {
      id: generateProjectId(),
      user_id: currentUserId,
      name: shoppingProjectName,
      ...createEmptyProjectSnapshot(),
    };

    let { data, error } = await supabase
      .from('projects')
      .insert(projectPayload)
      .select('id, user_id, name, created_at, updated_at')
      .single();

    if (error && projectPayload.id && isRowLevelSecurityError(error, 'projects')) {
      const { error: insertError } = await supabase
        .from('projects')
        .insert(projectPayload);

      if (!insertError) {
        ({ data, error } = await supabase
          .from('projects')
          .select(supportsProjectMembersRef.current
            ? 'id, user_id, name, created_at, updated_at, project_members(id, user_id, member_email, role, invited_by_user_id, created_at)'
            : 'id, user_id, name, created_at, updated_at')
          .eq('id', projectPayload.id)
          .single());
      } else {
        error = insertError;
      }
    }

    if (error || !data) {
      throw error || new Error('Unable to create Shopping List.');
    }

    refreshProjectCount();
    return normalizeProjectRecord(data, currentUserId);
  }, [
    createEmptyProjectSnapshot,
    currentUserId,
    generateProjectId,
    isRowLevelSecurityError,
    normalizeProjectRecord,
    refreshProjectCount,
    shoppingProjectName,
    supportsProjectMembersRef,
  ]);

  const loadProjects = useCallback(async () => {
    if (!currentUserId) return;

    setLoadingProjects(true);
    setProjectError('');

    const cachedState = await loadShoppingOfflineStateAsync(currentUserId);
    if (cachedState.projects?.length) {
      setProjects(cachedState.projects);
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

    const defaultProject = nextProjects.find((project) => project.isOwned) || nextProjects[0] || null;

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
    normalizeProjectRecord,
    persistOfflineState,
    shoppingProjectName,
    supportsProjectMembersRef,
  ]);

  const loadTodos = useCallback(async () => {
    if (!selectedProject?.id) {
      setTodos([]);
      return;
    }

    setLoadingTodos(true);
    setTodoError('');

    const cachedState = await loadShoppingOfflineStateAsync(currentUserId);
    const cachedTodos = cachedState.todosByProject?.[selectedProject.id] || [];
    if (cachedTodos.length > 0) {
      setTodos(sortTodos(cachedTodos));
    }

    if (!isOnline) {
      if (!cachedTodos.length) {
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
      if (isMissingTodoRelationError(error, 'manual_todos')) {
        setTodoError('Shopping items need the manual to-dos table enabled first.');
      } else {
        setTodoError(error.message || 'Unable to load grocery items.');
      }
      setTodos([]);
      setLoadingTodos(false);
      return;
    }

    const nextTodos = sortTodos((data || []).map(mapManualTodoRow));
    setTodos(nextTodos);
    persistOfflineState({
      ...cachedState,
      selectedProjectId: selectedProject.id,
      todosByProject: {
        ...(cachedState.todosByProject || {}),
        [selectedProject.id]: nextTodos,
      },
    });
    setLoadingTodos(false);
  }, [
    currentUserId,
    isMissingSchemaFieldError,
    isMissingTodoRelationError,
    isOnline,
    legacyManualTodoSelect,
    loadShoppingOfflineStateAsync,
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
