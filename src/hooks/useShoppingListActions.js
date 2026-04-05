import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isOfflineTempId } from '../utils/offlineState';
import { enqueueCreate, enqueueDelete, enqueueUpdate } from '../utils/offlineQueue';
import { notifyShoppingListSubscribers } from '../utils/pushNotifications';

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
  mapManualTodoRow,
  manualTodoSelect,
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
    const normalizedTitles = (titles || [])
      .map((title) => String(title || '').trim())
      .filter(Boolean);

    if (!selectedProject?.id || normalizedTitles.length === 0) return;

    setSavingItems(true);
    setTodoError('');

    if (!isOnline) {
      const offlineItems = normalizedTitles.map((title) => createOfflineShoppingTodo({
        title,
        projectId: selectedProject.id,
        userId: currentUserId,
      }));
      const nextTodos = sortTodos([...todos, ...offlineItems]);
      const cachedState = loadShoppingOfflineState(currentUserId);
      const nextQueue = offlineItems.reduce((queue, todo) => enqueueCreate(queue, {
        localId: todo._id,
        projectId: todo.projectId,
        userId: todo.assigneeUserId,
        title: todo.title,
        status: todo.status,
        completedAt: todo.completedAt || null,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
      }), cachedState.queue || []);

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
      return;
    }

    const rows = normalizedTitles.map((title) => ({
      user_id: currentUserId,
      project_id: selectedProject.id,
      title,
      due_date: null,
      owner_text: '',
      assignee_user_id: currentUserId,
      status: 'Open',
      recurrence: null,
      completed_at: null,
    }));

    const { data, error } = await supabase
      .from('manual_todos')
      .insert(rows)
      .select(manualTodoSelect);

    if (error) {
      setTodoError(error.message || 'Unable to add groceries right now.');
      setSavingItems(false);
      return;
    }

    const savedItems = sortTodos((data || []).map(mapManualTodoRow));
    setTodos((previous) => {
      const nextTodos = mergeTodosById(previous, savedItems);
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
      itemTitles: savedItems.map((item) => item.title),
    });
    setSavingItems(false);
  }, [
    createOfflineShoppingTodo,
    currentUserId,
    isOnline,
    loadShoppingOfflineState,
    manualTodoSelect,
    mapManualTodoRow,
    mergeTodosById,
    persistOfflineState,
    selectedProject?.id,
    setTodoError,
    setTodos,
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

    const { data, error } = await supabase
      .from('manual_todos')
      .update({
        status: nextStatus,
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', todo._id)
      .select(manualTodoSelect)
      .single();

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
    isOnline,
    loadShoppingOfflineState,
    manualTodoSelect,
    mapManualTodoRow,
    persistOfflineState,
    selectedProject?.id,
    setTodos,
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
    completionIntervalRef,
    completionTimeoutRef,
  };
}
