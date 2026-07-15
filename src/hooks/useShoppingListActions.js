import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isLikelyNetworkError } from '../utils/connectivity';
import { isOfflineTempId } from '../utils/offlineState';
import { enqueueCreate, enqueueDelete, enqueueUpdate } from '../utils/offlineQueue';
import { notifyShoppingListSubscribers } from '../utils/pushNotifications';
import { generateShoppingOperationId, planShoppingListAdds } from '../utils/shoppingListViewState';
import { isFreshTimestamp } from '../utils/refreshThrottle';
import { isMissingShoppingUpsertRpcError, upsertShoppingListItem } from '../utils/shoppingListRpc';

const SHOPPING_ADD_FRESHNESS_MS = 30_000;

const isOfflineBrowser = () => (
  typeof navigator !== 'undefined' && navigator.onLine === false
);

export function useShoppingListActions({
  currentUserId,
  isOnline,
  selectedProject,
  todos,
  setTodos,
  setTodoError,
  loadShoppingOfflineState,
  persistOfflineState,
  sortTodos,
  mergeTodosById,
  createOfflineShoppingTodo,
  isMissingSchemaFieldError,
  legacyManualTodoSelect,
  lastSyncedAt = '',
  mapManualTodoRow,
  manualTodoSelect,
  shoppingExtraFields = [],
}) {
  const [savingItems, setSavingItems] = useState(false);
  const [pendingCompleteId, setPendingCompleteId] = useState('');
  const [pendingCompleteSeconds, setPendingCompleteSeconds] = useState(1);
  const [savingTodoId, setSavingTodoId] = useState('');
  const [savingTodoAction, setSavingTodoAction] = useState('');
  const [failedTodoId, setFailedTodoId] = useState('');
  const [failedTodoMessage, setFailedTodoMessage] = useState('');
  const completionTimeoutRef = useRef(null);
  const completionIntervalRef = useRef(null);
  const supportsShoppingFieldsRef = useRef(true);

  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        window.clearTimeout(completionTimeoutRef.current);
      }
      if (completionIntervalRef.current) {
        window.clearInterval(completionIntervalRef.current);
      }
    };
  }, []);

  const getSelectClause = useCallback(() => (
    supportsShoppingFieldsRef.current ? manualTodoSelect : legacyManualTodoSelect
  ), [legacyManualTodoSelect, manualTodoSelect]);

  const loadLatestOpenTodos = useCallback(async (projectId) => {
    if (!projectId) return [];

    let selectClause = getSelectClause();
    let result = await supabase
      .from('manual_todos')
      .select(selectClause)
      .eq('project_id', projectId)
      .neq('status', 'Done')
      .order('created_at', { ascending: true });

    if (result.error && supportsShoppingFieldsRef.current && isMissingSchemaFieldError(result.error, shoppingExtraFields)) {
      supportsShoppingFieldsRef.current = false;
      selectClause = legacyManualTodoSelect;
      result = await supabase
        .from('manual_todos')
        .select(selectClause)
        .eq('project_id', projectId)
        .neq('status', 'Done')
        .order('created_at', { ascending: true });
    }

    if (result.error) {
      throw result.error;
    }

    return (result.data || []).map(mapManualTodoRow);
  }, [getSelectClause, isMissingSchemaFieldError, legacyManualTodoSelect, mapManualTodoRow, shoppingExtraFields]);

  const clearPendingCompletion = useCallback(() => {
    if (completionTimeoutRef.current) {
      window.clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    if (completionIntervalRef.current) {
      window.clearInterval(completionIntervalRef.current);
      completionIntervalRef.current = null;
    }
    setPendingCompleteId('');
    setPendingCompleteSeconds(1);
  }, []);

  const queueShoppingPlan = useCallback((plan, baseTodos, { uncertainCommit = false } = {}) => {
    if (!selectedProject?.id) return plan;

    const timestamp = new Date().toISOString();
    let nextTodos = [...(Array.isArray(baseTodos) ? baseTodos : [])];
    const cachedState = loadShoppingOfflineState(currentUserId);
    let nextQueue = cachedState.queue || [];

    for (const update of plan.updates || []) {
      nextTodos = nextTodos.map((todo) => (
        todo._id === update.todoId
          ? {
            ...todo,
            quantityValue: update.quantityValue,
            quantityUnit: update.quantityUnit,
            updatedAt: timestamp,
          }
          : todo
      ));
      nextQueue = enqueueUpdate(nextQueue, update.todoId, {
        quantityValue: update.quantityValue,
        quantityUnit: update.quantityUnit,
        updatedAt: timestamp,
      });
    }

    const offlineItems = (plan.inserts || []).map((item) => createOfflineShoppingTodo({
      title: item.title,
      projectId: selectedProject.id,
      userId: currentUserId,
      quantityValue: item.quantityValue,
      quantityUnit: item.quantityUnit,
      sourceType: item.sourceType,
      sourceBatchId: item.sourceBatchId,
      meta: item.meta,
    }));

    const insertOperationIdByTitle = new Map(
      (plan.inserts || []).map((item) => [item.title, item.operationId || generateShoppingOperationId()])
    );

    nextTodos = sortTodos([...nextTodos, ...offlineItems]);
    nextQueue = offlineItems.reduce((queue, todo) => enqueueCreate(queue, {
      localId: todo._id,
      operationId: insertOperationIdByTitle.get(todo.title) || generateShoppingOperationId(),
      projectId: todo.projectId,
      userId: todo.assigneeUserId,
      title: todo.title,
      status: todo.status,
      completedAt: todo.completedAt || null,
      quantityValue: todo.quantityValue,
      quantityUnit: todo.quantityUnit,
      sourceType: todo.sourceType,
      sourceBatchId: todo.sourceBatchId,
      meta: todo.meta,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      uncertainCommit: Boolean(uncertainCommit),
    }), nextQueue);

    setTodos(nextTodos);
    persistOfflineState({
      ...cachedState,
      selectedProjectId: selectedProject.id,
      todosByProject: {
        ...(cachedState.todosByProject || {}),
        [selectedProject.id]: nextTodos,
      },
      queue: nextQueue,
    });

    return {
      ...plan,
      queuedCount: (plan.updates?.length || 0) + offlineItems.length,
    };
  }, [
    createOfflineShoppingTodo,
    currentUserId,
    loadShoppingOfflineState,
    persistOfflineState,
    selectedProject?.id,
    setTodos,
    sortTodos,
  ]);

  const queueTodoPatch = useCallback((todoId, nextTodos, patch) => {
    if (!selectedProject?.id) return;
    const cachedState = loadShoppingOfflineState(currentUserId);
    persistOfflineState({
      ...cachedState,
      selectedProjectId: selectedProject.id,
      todosByProject: {
        ...(cachedState.todosByProject || {}),
        [selectedProject.id]: nextTodos,
      },
      queue: enqueueUpdate(cachedState.queue || [], todoId, patch),
    });
  }, [
    currentUserId,
    loadShoppingOfflineState,
    persistOfflineState,
    selectedProject?.id,
  ]);

  const addItems = useCallback(async (titles) => {
    const normalizedItems = (titles || [])
      .map((item) => {
        if (typeof item === 'string') {
          return {
          title: String(item || '').trim(),
          operationId: generateShoppingOperationId(),
          quantityValue: null,
            quantityUnit: '',
            sourceType: '',
            sourceBatchId: null,
            meta: {},
          };
        }

        return {
          title: String(item?.title || '').trim(),
          operationId: String(item?.operationId || '').trim() || generateShoppingOperationId(),
          quantityValue: (
            item?.quantityValue === null || item?.quantityValue === undefined || item?.quantityValue === ''
              ? null
              : (Number.isFinite(Number(item?.quantityValue)) ? Number(item.quantityValue) : null)
          ),
          quantityUnit: String(item?.quantityUnit || '').trim(),
          sourceType: String(item?.sourceType || '').trim(),
          sourceBatchId: item?.sourceBatchId || null,
          meta: item?.meta && typeof item.meta === 'object' ? item.meta : {},
        };
      })
      .filter((item) => item.title);

    if (!selectedProject?.id || normalizedItems.length === 0) return;

    const initialPlan = planShoppingListAdds({
      existingTodos: todos,
      incomingItems: normalizedItems,
    });

    if (initialPlan.addedCount === 0 && initialPlan.mergedCount === 0) {
      return initialPlan;
    }

    setSavingItems(true);
    setTodoError('');

    if (!isOnline) {
      const queuedPlan = queueShoppingPlan(initialPlan, todos);
      setSavingItems(false);
      return queuedPlan;
    }

    const hasFreshLocalList = isFreshTimestamp(lastSyncedAt, Date.now(), SHOPPING_ADD_FRESHNESS_MS);
    let latestOpenTodos = [];
    if (!hasFreshLocalList) {
      try {
        latestOpenTodos = await loadLatestOpenTodos(selectedProject.id);
      } catch (nextError) {
        if (isLikelyNetworkError(nextError, { online: isOnline && !isOfflineBrowser() })) {
          const queuedPlan = queueShoppingPlan(initialPlan, todos);
          setSavingItems(false);
          return queuedPlan;
        }
        setTodoError(nextError?.message || 'Unable to confirm the latest groceries right now.');
        setSavingItems(false);
        return null;
      }
    }

    const effectiveExistingTodos = !hasFreshLocalList && latestOpenTodos.length > 0
      ? mergeTodosById(todos, latestOpenTodos)
      : todos;
    const addPlan = planShoppingListAdds({
      existingTodos: effectiveExistingTodos,
      incomingItems: normalizedItems,
    });

    if (addPlan.addedCount === 0 && addPlan.mergedCount === 0) {
      setSavingItems(false);
      return addPlan;
    }

    const rpcResults = await Promise.all((addPlan.preparedItems || []).map(async (item) => {
      try {
        const { data, error } = await upsertShoppingListItem({
          supabaseClient: supabase,
          projectId: selectedProject.id,
          item,
          operationId: item.operationId,
        });

        return { data, error, item };
      } catch (error) {
        return { data: null, error, item };
      }
    }));

    const failedResults = rpcResults.filter((result) => {
      const savedRow = Array.isArray(result?.data) ? result.data[0] : result?.data;
      return result?.error || !savedRow;
    });
    const failedResult = failedResults[0] || null;

    if (failedResult) {
      const savedRows = rpcResults
        .filter((result) => !failedResults.includes(result))
        .map((result) => {
          const savedRow = Array.isArray(result.data) ? result.data[0] : result.data;
          return mapManualTodoRow(savedRow);
        });
      const nextBaseTodos = mergeTodosById(effectiveExistingTodos, savedRows);
      const networkFailure = failedResults.every((result) => (
        isLikelyNetworkError(result.error, { online: isOnline && !isOfflineBrowser() })
      ));

      if (networkFailure) {
        const failedPlan = planShoppingListAdds({
          existingTodos: nextBaseTodos,
          incomingItems: failedResults.map((result) => result.item).filter(Boolean),
        });
        const queuedPlan = queueShoppingPlan(failedPlan, nextBaseTodos, { uncertainCommit: true });
        if (savedRows.length > 0) {
          await notifyShoppingListSubscribers({
            projectId: selectedProject.id,
            itemTitles: savedRows.map((item) => item.title),
          });
        }
        setSavingItems(false);
        return {
          ...addPlan,
          queuedCount: queuedPlan?.queuedCount || 0,
        };
      }

      let serverTodos = [];
      try {
        serverTodos = await loadLatestOpenTodos(selectedProject.id);
      } catch {
        serverTodos = [];
      }

      if (serverTodos.length > 0) {
        setTodos((previous) => {
          const nextTodos = mergeTodosById(previous, serverTodos);
          const cachedState = loadShoppingOfflineState(currentUserId);
          persistOfflineState({
            ...cachedState,
            selectedProjectId: selectedProject.id,
            todosByProject: {
              ...(cachedState.todosByProject || {}),
              [selectedProject.id]: nextTodos,
            },
            lastSyncedAt: new Date().toISOString(),
          });
          return nextTodos;
        });
      }

      setTodoError(
        isMissingShoppingUpsertRpcError(failedResult.error)
          ? 'Shopping List needs the latest SQL migration before groceries can be merged safely.'
          : (failedResult.error?.message || 'Unable to add groceries right now.')
      );
      setSavingItems(false);
      return savedRows.length > 0 ? addPlan : null;
    }

    const savedRows = rpcResults.map((result) => {
      const savedRow = Array.isArray(result.data) ? result.data[0] : result.data;
      return mapManualTodoRow(savedRow);
    });

    setTodos((previous) => {
      const nextTodos = mergeTodosById(previous, savedRows);
      const cachedState = loadShoppingOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject.id,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: nextTodos,
        },
        lastSyncedAt: new Date().toISOString(),
      });
      return nextTodos;
    });
    await notifyShoppingListSubscribers({
      projectId: selectedProject.id,
      itemTitles: savedRows.map((item) => item.title),
    });
    setSavingItems(false);
    return addPlan;
  }, [
    currentUserId,
    isOnline,
    lastSyncedAt,
    loadLatestOpenTodos,
    loadShoppingOfflineState,
    mapManualTodoRow,
    mergeTodosById,
    persistOfflineState,
    queueShoppingPlan,
    selectedProject,
    setTodoError,
    setTodos,
    todos,
  ]);

  const toggleTodoStatus = useCallback(async (todo) => {
    const nextStatus = todo.status === 'Done' ? 'Open' : 'Done';
    const completedAt = nextStatus === 'Done' ? new Date().toISOString() : null;
    const updatedAt = new Date().toISOString();
    const actionLabel = nextStatus === 'Done' ? 'complete' : 'reopen';

    const previous = todos;
    setFailedTodoId('');
    setFailedTodoMessage('');
    setSavingTodoId(todo._id);
    setSavingTodoAction(actionLabel);
    const optimisticTodos = sortTodos(todos.map((item) => (
      item._id === todo._id
        ? {
          ...item,
          status: nextStatus,
          completedAt,
          updatedAt,
        }
        : item
    )));
    setTodos(optimisticTodos);

    if (!isOnline || isOfflineTempId(todo._id)) {
      queueTodoPatch(todo._id, optimisticTodos, {
        status: nextStatus,
        completedAt,
        updatedAt,
      });
      setSavingTodoId('');
      setSavingTodoAction('');
      return;
    }

    let selectClause = getSelectClause();
    let { data, error } = await supabase
      .from('manual_todos')
      .update({
        status: nextStatus,
        completed_at: completedAt,
        updated_at: updatedAt,
      })
      .eq('id', todo._id)
      .select(selectClause)
      .single();

    if (error && supportsShoppingFieldsRef.current && isMissingSchemaFieldError(error, shoppingExtraFields)) {
      supportsShoppingFieldsRef.current = false;
      selectClause = legacyManualTodoSelect;
      ({ data, error } = await supabase
        .from('manual_todos')
        .update({
          status: nextStatus,
          completed_at: completedAt,
          updated_at: updatedAt,
        })
        .eq('id', todo._id)
        .select(selectClause)
        .single());
    }

    if (error) {
      if (isLikelyNetworkError(error, { online: isOnline && !isOfflineBrowser() })) {
        queueTodoPatch(todo._id, optimisticTodos, {
          status: nextStatus,
          completedAt,
          updatedAt,
        });
        setSavingTodoId('');
        setSavingTodoAction('');
        return;
      }
      setTodos(previous);
      setFailedTodoId(todo._id);
      setFailedTodoMessage(
        isOfflineBrowser()
          ? 'Your connection dropped before this grocery was saved. Please try again.'
          : (error.message || 'Unable to update this grocery right now.')
      );
      setSavingTodoId('');
      setSavingTodoAction('');
      return;
    }

    setTodos((previousItems) => {
      const nextTodos = sortTodos(previousItems.map((item) => (
        item._id === todo._id ? mapManualTodoRow(data) : item
      )));
      const cachedState = loadShoppingOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: nextTodos,
        },
        lastSyncedAt: new Date().toISOString(),
      });
      return nextTodos;
    });
    if (nextStatus === 'Done') {
      await notifyShoppingListSubscribers({
        projectId: selectedProject.id,
        itemTitles: [todo.title],
        eventType: 'bought',
      });
    }
    setSavingTodoId('');
    setSavingTodoAction('');
    setFailedTodoId('');
    setFailedTodoMessage('');
  }, [
    currentUserId,
    getSelectClause,
    isMissingSchemaFieldError,
    isOnline,
    legacyManualTodoSelect,
    loadShoppingOfflineState,
    mapManualTodoRow,
    persistOfflineState,
    queueTodoPatch,
    selectedProject?.id,
    setTodos,
    shoppingExtraFields,
    sortTodos,
    todos,
  ]);

  const deleteTodo = useCallback(async (todoId) => {
    if (pendingCompleteId === todoId) {
      clearPendingCompletion();
    }
    if (failedTodoId === todoId) {
      setFailedTodoId('');
      setFailedTodoMessage('');
    }
    const deletedTodo = todos.find((item) => item._id === todoId) || null;
    const previous = todos;
    const nextTodos = todos.filter((item) => item._id !== todoId);
    setTodos(nextTodos);

    if (!isOnline || isOfflineTempId(todoId)) {
      const cachedState = loadShoppingOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: nextTodos,
        },
        queue: enqueueDelete(cachedState.queue || [], todoId),
      });
      return;
    }

    const { error } = await supabase
      .from('manual_todos')
      .delete()
      .eq('id', todoId);

    if (error) {
      if (isLikelyNetworkError(error, { online: isOnline && !isOfflineBrowser() })) {
        const cachedState = loadShoppingOfflineState(currentUserId);
        persistOfflineState({
          ...cachedState,
          selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
          todosByProject: {
            ...(cachedState.todosByProject || {}),
            [selectedProject.id]: nextTodos,
          },
          queue: enqueueDelete(cachedState.queue || [], todoId),
        });
        return;
      }
      setTodos(previous);
      setTodoError(error.message || 'Unable to remove this grocery right now.');
      return;
    }

    const cachedState = loadShoppingOfflineState(currentUserId);
    persistOfflineState({
      ...cachedState,
      selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
      todosByProject: {
        ...(cachedState.todosByProject || {}),
        [selectedProject.id]: nextTodos,
      },
      lastSyncedAt: new Date().toISOString(),
    });
    if (deletedTodo?.title) {
      await notifyShoppingListSubscribers({
        projectId: selectedProject.id,
        itemTitles: [deletedTodo.title],
        eventType: 'deleted',
      });
    }
  }, [
    clearPendingCompletion,
    currentUserId,
    failedTodoId,
    isOnline,
    loadShoppingOfflineState,
    pendingCompleteId,
    persistOfflineState,
    selectedProject?.id,
    setTodoError,
    setTodos,
    todos,
  ]);

  const updateTodoTitle = useCallback(async (todo, nextTitle) => {
    const title = String(nextTitle || '').trim();
    if (!todo?._id) {
      return { ok: false, message: 'Choose a grocery to update.' };
    }
    if (!title) {
      return { ok: false, message: 'Enter a grocery name before saving.' };
    }
    if (title === todo.title) {
      return { ok: true };
    }

    const updatedAt = new Date().toISOString();
    const previous = todos;
    const optimisticTodos = sortTodos(todos.map((item) => (
      item._id === todo._id
        ? {
            ...item,
            title,
            updatedAt,
          }
        : item
    )));

    setFailedTodoId('');
    setFailedTodoMessage('');
    setSavingTodoId(todo._id);
    setSavingTodoAction('edit');
    setTodos(optimisticTodos);

    if (!isOnline || isOfflineTempId(todo._id)) {
      queueTodoPatch(todo._id, optimisticTodos, {
        title,
        updatedAt,
      });
      setSavingTodoId('');
      setSavingTodoAction('');
      return { ok: true };
    }

    let selectClause = getSelectClause();
    let { data, error } = await supabase
      .from('manual_todos')
      .update({
        title,
        updated_at: updatedAt,
      })
      .eq('id', todo._id)
      .select(selectClause)
      .single();

    if (error && supportsShoppingFieldsRef.current && isMissingSchemaFieldError(error, shoppingExtraFields)) {
      supportsShoppingFieldsRef.current = false;
      selectClause = legacyManualTodoSelect;
      ({ data, error } = await supabase
        .from('manual_todos')
        .update({
          title,
          updated_at: updatedAt,
        })
        .eq('id', todo._id)
        .select(selectClause)
        .single());
    }

    if (error) {
      if (isLikelyNetworkError(error, { online: isOnline && !isOfflineBrowser() })) {
        queueTodoPatch(todo._id, optimisticTodos, {
          title,
          updatedAt,
        });
        setSavingTodoId('');
        setSavingTodoAction('');
        return { ok: true, queued: true };
      }
      setTodos(previous);
      setSavingTodoId('');
      setSavingTodoAction('');
      return {
        ok: false,
        message: isOfflineBrowser()
          ? 'Your connection dropped before this grocery name was saved. Please try again.'
          : (error.message || 'Unable to update this grocery right now.'),
      };
    }

    setTodos((previousItems) => {
      const nextTodos = sortTodos(previousItems.map((item) => (
        item._id === todo._id ? mapManualTodoRow(data) : item
      )));
      const cachedState = loadShoppingOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: nextTodos,
        },
        lastSyncedAt: new Date().toISOString(),
      });
      return nextTodos;
    });

    setSavingTodoId('');
    setSavingTodoAction('');
    return { ok: true };
  }, [
    currentUserId,
    getSelectClause,
    isMissingSchemaFieldError,
    isOnline,
    legacyManualTodoSelect,
    loadShoppingOfflineState,
    mapManualTodoRow,
    persistOfflineState,
    queueTodoPatch,
    selectedProject?.id,
    setTodos,
    shoppingExtraFields,
    sortTodos,
    todos,
  ]);

  const retryTodoAction = useCallback((todo) => {
    setFailedTodoId('');
    setFailedTodoMessage('');
    clearPendingCompletion();
    void toggleTodoStatus(todo);
  }, [clearPendingCompletion, toggleTodoStatus]);

  return {
    addItems,
    clearPendingCompletion,
    deleteTodo,
    failedTodoId,
    failedTodoMessage,
    pendingCompleteId,
    pendingCompleteSeconds,
    retryTodoAction,
    savingItems,
    savingTodoAction,
    savingTodoId,
    setFailedTodoId,
    setFailedTodoMessage,
    setPendingCompleteId,
    setPendingCompleteSeconds,
    toggleTodoStatus,
    updateTodoTitle,
    completionIntervalRef,
    completionTimeoutRef,
  };
}
