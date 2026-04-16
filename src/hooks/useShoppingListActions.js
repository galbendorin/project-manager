import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isOfflineTempId } from '../utils/offlineState';
import { enqueueCreate, enqueueDelete, enqueueUpdate } from '../utils/offlineQueue';
import { notifyShoppingListSubscribers } from '../utils/pushNotifications';
import { planShoppingListAdds } from '../utils/shoppingListViewState';

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

  const addItems = useCallback(async (titles) => {
    const normalizedItems = (titles || [])
      .map((item) => {
        if (typeof item === 'string') {
          return {
            title: String(item || '').trim(),
            quantityValue: null,
            quantityUnit: '',
            sourceType: '',
            sourceBatchId: null,
            meta: {},
          };
        }

        return {
          title: String(item?.title || '').trim(),
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

    const addPlan = planShoppingListAdds({
      existingTodos: todos,
      incomingItems: normalizedItems,
    });

    if (addPlan.addedCount === 0 && addPlan.mergedCount === 0) {
      return addPlan;
    }

    setSavingItems(true);
    setTodoError('');

    if (!isOnline) {
      const timestamp = new Date().toISOString();
      let nextTodos = [...todos];
      let nextQueue = loadShoppingOfflineState(currentUserId).queue || [];

      for (const update of addPlan.updates) {
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

      const offlineItems = addPlan.inserts.map((item) => createOfflineShoppingTodo({
        title: item.title,
        projectId: selectedProject.id,
        userId: currentUserId,
        quantityValue: item.quantityValue,
        quantityUnit: item.quantityUnit,
        sourceType: item.sourceType,
        sourceBatchId: item.sourceBatchId,
        meta: item.meta,
      }));

      nextTodos = sortTodos([...nextTodos, ...offlineItems]);
      nextQueue = offlineItems.reduce((queue, todo) => enqueueCreate(queue, {
        localId: todo._id,
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
      }), nextQueue);

      const cachedState = loadShoppingOfflineState(currentUserId);

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
      setSavingItems(false);
      return addPlan;
    }

    const rows = addPlan.inserts.map((item) => ({
      user_id: currentUserId,
      project_id: selectedProject.id,
      title: item.title,
      due_date: null,
      owner_text: '',
      assignee_user_id: currentUserId,
      status: 'Open',
      recurrence: null,
      completed_at: null,
      ...(supportsShoppingFieldsRef.current ? {
        quantity_value: item.quantityValue,
        quantity_unit: item.quantityUnit || '',
        source_type: item.sourceType || '',
        source_batch_id: item.sourceBatchId || null,
        meta: item.meta || {},
      } : {}),
    }));

    const timestamp = new Date().toISOString();
    const savedUpdatedRows = [];

    for (const update of addPlan.updates) {
      let selectClause = getSelectClause();
      let updateResult = await supabase
        .from('manual_todos')
        .update({
          quantity_value: update.quantityValue,
          quantity_unit: update.quantityUnit || '',
          updated_at: timestamp,
        })
        .eq('id', update.todoId)
        .select(selectClause)
        .single();

      if (updateResult.error && supportsShoppingFieldsRef.current && isMissingSchemaFieldError(updateResult.error, shoppingExtraFields)) {
        supportsShoppingFieldsRef.current = false;
        selectClause = legacyManualTodoSelect;
        updateResult = await supabase
          .from('manual_todos')
          .update({
            updated_at: timestamp,
          })
          .eq('id', update.todoId)
          .select(selectClause)
          .single();
      }

      if (updateResult.error || !updateResult.data) {
        setTodoError(updateResult.error?.message || 'Unable to update this grocery right now.');
        setSavingItems(false);
        return addPlan;
      }

      savedUpdatedRows.push(mapManualTodoRow(updateResult.data));
    }

    let savedItems = [];
    if (rows.length > 0) {
      let selectClause = getSelectClause();
      let { data, error } = await supabase
        .from('manual_todos')
        .insert(rows)
        .select(selectClause);

      if (error && supportsShoppingFieldsRef.current && isMissingSchemaFieldError(error, shoppingExtraFields)) {
        supportsShoppingFieldsRef.current = false;
        selectClause = legacyManualTodoSelect;
        ({ data, error } = await supabase
          .from('manual_todos')
          .insert(addPlan.inserts.map((item) => ({
            user_id: currentUserId,
            project_id: selectedProject.id,
            title: item.title,
            due_date: null,
            owner_text: '',
            assignee_user_id: currentUserId,
            status: 'Open',
            recurrence: null,
            completed_at: null,
          })))
          .select(selectClause));
      }

      if (error) {
        setTodoError(error.message || 'Unable to add groceries right now.');
        setSavingItems(false);
        return addPlan;
      }

      savedItems = sortTodos((data || []).map(mapManualTodoRow));
    }

    setTodos((previous) => {
      const nextTodos = mergeTodosById(previous, [...savedUpdatedRows, ...savedItems]);
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
      itemTitles: [...savedItems, ...savedUpdatedRows].map((item) => item.title),
    });
    setSavingItems(false);
    return addPlan;
  }, [
    currentUserId,
    createOfflineShoppingTodo,
    getSelectClause,
    isMissingSchemaFieldError,
    isOnline,
    legacyManualTodoSelect,
    loadShoppingOfflineState,
    mapManualTodoRow,
    mergeTodosById,
    persistOfflineState,
    selectedProject,
    setTodoError,
    setTodos,
    shoppingExtraFields,
    sortTodos,
    todos,
  ]);

  const toggleTodoStatus = useCallback(async (todo) => {
    const nextStatus = todo.status === 'Done' ? 'Open' : 'Done';
    const completedAt = nextStatus === 'Done' ? new Date().toISOString() : null;
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
          updatedAt: new Date().toISOString(),
        }
        : item
    )));
    setTodos(optimisticTodos);

    if (!isOnline || isOfflineTempId(todo._id)) {
      const cachedState = loadShoppingOfflineState(currentUserId);
      const nextQueue = enqueueUpdate(cachedState.queue || [], todo._id, {
        status: nextStatus,
        completedAt,
        updatedAt: new Date().toISOString(),
      });
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: optimisticTodos,
        },
        queue: nextQueue,
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
        updated_at: new Date().toISOString(),
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
          updated_at: new Date().toISOString(),
        })
        .eq('id', todo._id)
        .select(selectClause)
        .single());
    }

    if (error) {
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
      const cachedState = loadShoppingOfflineState(currentUserId);
      persistOfflineState({
        ...cachedState,
        selectedProjectId: selectedProject?.id || cachedState.selectedProjectId,
        todosByProject: {
          ...(cachedState.todosByProject || {}),
          [selectedProject.id]: optimisticTodos,
        },
        queue: enqueueUpdate(cachedState.queue || [], todo._id, {
          title,
          updatedAt,
        }),
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
