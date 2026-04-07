import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  createLocalManualTodo,
  buildLocalTodoUpdate,
  applyTodoUpdateToState,
  buildTodoUpdatePatch,
  buildRecurringFollowUpInsert,
} from './todos';
import {
  MANUAL_TODO_SELECT,
  LEGACY_MANUAL_TODO_SELECT,
  mapManualTodoRow,
  isMissingRelationError,
  isMissingSchemaFieldError,
} from './manualTodoUtils';
import {
  createOfflineTempId,
  isOfflineTempId,
} from '../../utils/offlineState';
import {
  enqueueCreate,
  enqueueDelete,
  enqueueUpdate,
  replaceQueuedTargetId,
} from '../../utils/offlineQueue';

const EXTENDED_MANUAL_TODO_FIELDS = ['description', 'kanban_column_id', 'kanban_position'];

const buildManualTodoInsertPayload = (todo, userId, supportsExtendedFields = true) => {
  const payload = {
    user_id: userId,
    project_id: todo.projectId || null,
    title: todo.title || '',
    due_date: todo.dueDate || null,
    owner_text: todo.owner || '',
    assignee_user_id: todo.assigneeUserId || userId || null,
    status: todo.status === 'Done' ? 'Done' : 'Open',
    recurrence: todo.recurrence,
    completed_at: todo.completedAt || null,
  };

  if (supportsExtendedFields) {
    payload.description = todo.description || '';
    payload.kanban_column_id = todo.kanbanColumnId || null;
    payload.kanban_position = Number.isFinite(Number(todo.kanbanPosition)) ? Number(todo.kanbanPosition) : 0;
  }

  return payload;
};

const buildManualTodoUpdatePayload = (patch = {}, supportsExtendedFields = true) => {
  const nextPatch = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'projectId')) nextPatch.project_id = patch.projectId || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) nextPatch.title = patch.title || '';
  if (Object.prototype.hasOwnProperty.call(patch, 'dueDate')) nextPatch.due_date = patch.dueDate || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'owner')) nextPatch.owner_text = patch.owner || '';
  if (Object.prototype.hasOwnProperty.call(patch, 'assigneeUserId')) nextPatch.assignee_user_id = patch.assigneeUserId || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) nextPatch.status = patch.status === 'Done' ? 'Done' : 'Open';
  if (Object.prototype.hasOwnProperty.call(patch, 'recurrence')) nextPatch.recurrence = patch.recurrence || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'completedAt')) nextPatch.completed_at = patch.completedAt || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'updatedAt')) nextPatch.updated_at = patch.updatedAt;

  if (supportsExtendedFields) {
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) nextPatch.description = patch.description || '';
    if (Object.prototype.hasOwnProperty.call(patch, 'kanbanColumnId')) nextPatch.kanban_column_id = patch.kanbanColumnId || null;
    if (Object.prototype.hasOwnProperty.call(patch, 'kanbanPosition')) nextPatch.kanban_position = Number.isFinite(Number(patch.kanbanPosition)) ? Number(patch.kanbanPosition) : 0;
  }

  return nextPatch;
};

const buildQueuedManualTodo = (todoId, record = {}, now) => ({
  _id: todoId,
  projectId: record.projectId || null,
  title: record.title || 'New Task',
  description: record.description || '',
  dueDate: record.dueDate || '',
  owner: record.owner || 'PM',
  assigneeUserId: record.assigneeUserId || null,
  status: record.status === 'Done' ? 'Done' : 'Open',
  recurrence: record.recurrence || null,
  kanbanColumnId: record.kanbanColumnId || null,
  kanbanPosition: Number.isFinite(Number(record.kanbanPosition)) ? Number(record.kanbanPosition) : 0,
  createdAt: record.createdAt || now(),
  updatedAt: record.updatedAt || record.createdAt || now(),
  completedAt: record.completedAt || '',
});

const applyManualTodoLocalPatch = (todo, patch = {}) => ({
  ...todo,
  projectId: Object.prototype.hasOwnProperty.call(patch, 'projectId') ? (patch.projectId || null) : todo.projectId,
  title: Object.prototype.hasOwnProperty.call(patch, 'title') ? (patch.title || '') : todo.title,
  description: Object.prototype.hasOwnProperty.call(patch, 'description') ? (patch.description || '') : todo.description,
  dueDate: Object.prototype.hasOwnProperty.call(patch, 'dueDate') ? (patch.dueDate || '') : todo.dueDate,
  owner: Object.prototype.hasOwnProperty.call(patch, 'owner') ? (patch.owner || '') : todo.owner,
  assigneeUserId: Object.prototype.hasOwnProperty.call(patch, 'assigneeUserId') ? (patch.assigneeUserId || null) : todo.assigneeUserId,
  status: Object.prototype.hasOwnProperty.call(patch, 'status') ? (patch.status === 'Done' ? 'Done' : 'Open') : todo.status,
  recurrence: Object.prototype.hasOwnProperty.call(patch, 'recurrence') ? (patch.recurrence || null) : todo.recurrence,
  kanbanColumnId: Object.prototype.hasOwnProperty.call(patch, 'kanbanColumnId') ? (patch.kanbanColumnId || null) : todo.kanbanColumnId,
  kanbanPosition: Object.prototype.hasOwnProperty.call(patch, 'kanbanPosition')
    ? (Number.isFinite(Number(patch.kanbanPosition)) ? Number(patch.kanbanPosition) : 0)
    : todo.kanbanPosition,
  updatedAt: patch.updatedAt || todo.updatedAt,
  completedAt: Object.prototype.hasOwnProperty.call(patch, 'completedAt') ? (patch.completedAt || '') : todo.completedAt,
});

const applyQueuedTodoChanges = (baseTodos = [], queue = [], now) => {
  let next = Array.isArray(baseTodos) ? [...baseTodos] : [];

  for (const op of Array.isArray(queue) ? queue : []) {
    if (!op?.kind) continue;

    if (op.kind === 'create') {
      const queuedTodo = buildQueuedManualTodo(op.targetId, op.record, now);
      const existingIndex = next.findIndex((item) => item._id === op.targetId);
      if (existingIndex === -1) {
        next.push(queuedTodo);
      } else {
        next[existingIndex] = queuedTodo;
      }
      continue;
    }

    if (op.kind === 'update') {
      next = next.map((item) => (
        item._id === op.targetId ? applyManualTodoLocalPatch(item, op.patch) : item
      ));
      continue;
    }

    if (op.kind === 'delete') {
      next = next.filter((item) => item._id !== op.targetId);
    }
  }

  return next;
};

export function useProjectTodos({
  isOnline,
  now,
  projectId,
  setLastSaved,
  setOfflinePendingSync,
  setUsingOfflineSnapshot,
  userId,
}) {
  const [todos, setTodos] = useState([]);
  const [todoQueue, setTodoQueue] = useState([]);
  const [todoQueueRetryToken, setTodoQueueRetryToken] = useState(0);

  const supportsManualTodosTableRef = useRef(true);
  const supportsExtendedManualTodoFieldsRef = useRef(true);
  const todoQueueRef = useRef([]);
  const syncingTodoQueueRef = useRef(false);
  const todoQueueRetryTimeoutRef = useRef(null);

  useEffect(() => {
    todoQueueRef.current = todoQueue;
  }, [todoQueue]);

  useEffect(() => () => {
    if (todoQueueRetryTimeoutRef.current) {
      window.clearTimeout(todoQueueRetryTimeoutRef.current);
    }
  }, []);

  const loadTodos = useCallback(async (pendingTodoQueue = todoQueueRef.current) => {
    let nextTodos = [];

    if (userId && supportsManualTodosTableRef.current) {
      let selectClause = supportsExtendedManualTodoFieldsRef.current
        ? MANUAL_TODO_SELECT
        : LEGACY_MANUAL_TODO_SELECT;
      let { data: todoRows, error: todoError } = await supabase
        .from('manual_todos')
        .select(selectClause)
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (todoError && supportsExtendedManualTodoFieldsRef.current && isMissingSchemaFieldError(todoError, EXTENDED_MANUAL_TODO_FIELDS)) {
        supportsExtendedManualTodoFieldsRef.current = false;
        selectClause = LEGACY_MANUAL_TODO_SELECT;
        ({ data: todoRows, error: todoError } = await supabase
          .from('manual_todos')
          .select(selectClause)
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }));
      }

      if (!todoError) {
        nextTodos = applyQueuedTodoChanges((todoRows || []).map(mapManualTodoRow), pendingTodoQueue, now);
        setTodos(nextTodos);
      } else if (isMissingRelationError(todoError, 'manual_todos')) {
        supportsManualTodosTableRef.current = false;
        nextTodos = applyQueuedTodoChanges([], pendingTodoQueue, now);
        setTodos(nextTodos);
      } else {
        console.error('Failed to load manual todos:', todoError);
        nextTodos = applyQueuedTodoChanges([], pendingTodoQueue, now);
        setTodos(nextTodos);
      }
    } else {
      nextTodos = applyQueuedTodoChanges([], pendingTodoQueue, now);
      setTodos(nextTodos);
    }

    return nextTodos;
  }, [now, projectId, userId]);

  useEffect(() => {
    if (!projectId || !userId || !supportsManualTodosTableRef.current || !isOnline || todoQueue.length === 0) {
      return undefined;
    }

    if (syncingTodoQueueRef.current) return undefined;

    let cancelled = false;
    const scheduleRetry = () => {
      if (todoQueueRetryTimeoutRef.current) {
        window.clearTimeout(todoQueueRetryTimeoutRef.current);
      }
      todoQueueRetryTimeoutRef.current = window.setTimeout(() => {
        setTodoQueueRetryToken((value) => value + 1);
      }, 5000);
    };

    const syncTodoQueue = async () => {
      syncingTodoQueueRef.current = true;

      try {
        while (!cancelled && todoQueueRef.current.length > 0) {
          const [op] = todoQueueRef.current;
          if (!op) break;

          if (op.kind === 'create') {
            let selectClause = supportsExtendedManualTodoFieldsRef.current
              ? MANUAL_TODO_SELECT
              : LEGACY_MANUAL_TODO_SELECT;
            let insertPayload = buildManualTodoInsertPayload(
              buildQueuedManualTodo(op.targetId, op.record, now),
              userId,
              supportsExtendedManualTodoFieldsRef.current
            );
            let { data, error } = await supabase
              .from('manual_todos')
              .insert(insertPayload)
              .select(selectClause)
              .single();

            if (error && supportsExtendedManualTodoFieldsRef.current && isMissingSchemaFieldError(error, EXTENDED_MANUAL_TODO_FIELDS)) {
              supportsExtendedManualTodoFieldsRef.current = false;
              selectClause = LEGACY_MANUAL_TODO_SELECT;
              insertPayload = buildManualTodoInsertPayload(
                buildQueuedManualTodo(op.targetId, op.record, now),
                userId,
                false
              );
              ({ data, error } = await supabase
                .from('manual_todos')
                .insert(insertPayload)
                .select(selectClause)
                .single());
            }

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              setTodoQueue([]);
              break;
            }

            if (error || !data) {
              console.error('Failed to sync queued manual todo create:', error);
              scheduleRetry();
              break;
            }

            const savedTodo = mapManualTodoRow(data);
            const previousId = op.targetId;
            if (todoQueueRetryTimeoutRef.current) {
              window.clearTimeout(todoQueueRetryTimeoutRef.current);
              todoQueueRetryTimeoutRef.current = null;
            }

            setTodos((prev) => prev.map((item) => (
              item._id === previousId ? savedTodo : item
            )));
            setTodoQueue((prev) => replaceQueuedTargetId(prev.slice(1), previousId, savedTodo._id));
            setLastSaved(new Date());
            setUsingOfflineSnapshot(false);
            continue;
          }

          if (op.kind === 'update') {
            let selectClause = supportsExtendedManualTodoFieldsRef.current
              ? MANUAL_TODO_SELECT
              : LEGACY_MANUAL_TODO_SELECT;
            let updatePayload = buildManualTodoUpdatePayload(op.patch, supportsExtendedManualTodoFieldsRef.current);
            let { data, error } = await supabase
              .from('manual_todos')
              .update(updatePayload)
              .eq('id', op.targetId)
              .select(selectClause)
              .single();

            if (error && supportsExtendedManualTodoFieldsRef.current && isMissingSchemaFieldError(error, EXTENDED_MANUAL_TODO_FIELDS)) {
              supportsExtendedManualTodoFieldsRef.current = false;
              selectClause = LEGACY_MANUAL_TODO_SELECT;
              updatePayload = buildManualTodoUpdatePayload(op.patch, false);
              ({ data, error } = await supabase
                .from('manual_todos')
                .update(updatePayload)
                .eq('id', op.targetId)
                .select(selectClause)
                .single());
            }

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              setTodoQueue([]);
              break;
            }

            if (error || !data) {
              console.error('Failed to sync queued manual todo update:', error);
              scheduleRetry();
              break;
            }

            const savedTodo = mapManualTodoRow(data);
            if (todoQueueRetryTimeoutRef.current) {
              window.clearTimeout(todoQueueRetryTimeoutRef.current);
              todoQueueRetryTimeoutRef.current = null;
            }
            setTodos((prev) => prev.map((item) => (
              item._id === op.targetId ? savedTodo : item
            )));
            setTodoQueue((prev) => prev.slice(1));
            setLastSaved(new Date());
            setUsingOfflineSnapshot(false);
            continue;
          }

          if (op.kind === 'delete') {
            const { error } = await supabase
              .from('manual_todos')
              .delete()
              .eq('id', op.targetId);

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              setTodoQueue([]);
              break;
            }

            if (error) {
              console.error('Failed to sync queued manual todo delete:', error);
              scheduleRetry();
              break;
            }

            if (todoQueueRetryTimeoutRef.current) {
              window.clearTimeout(todoQueueRetryTimeoutRef.current);
              todoQueueRetryTimeoutRef.current = null;
            }
            setTodoQueue((prev) => prev.slice(1));
            setLastSaved(new Date());
            setUsingOfflineSnapshot(false);
          }
        }
      } finally {
        syncingTodoQueueRef.current = false;
      }
    };

    void syncTodoQueue();

    return () => {
      cancelled = true;
    };
  }, [isOnline, now, projectId, setLastSaved, setUsingOfflineSnapshot, todoQueue.length, todoQueueRetryToken, userId]);

  const addTodo = useCallback(async (todoData = {}) => {
    const ts = now();
    const localTodoBase = createLocalManualTodo({ todoData, projectId, userId, ts });

    if (!userId || !supportsManualTodosTableRef.current) {
      setTodos((prev) => [...prev, localTodoBase]);
      return localTodoBase;
    }

    if (!isOnline) {
      const localTodo = {
        ...localTodoBase,
        _id: createOfflineTempId('offline-todo'),
      };
      setTodos((prev) => [...prev, localTodo]);
      setTodoQueue((prev) => enqueueCreate(prev, {
        localId: localTodo._id,
        projectId: localTodo.projectId,
        title: localTodo.title,
        description: localTodo.description,
        dueDate: localTodo.dueDate,
        owner: localTodo.owner,
        assigneeUserId: localTodo.assigneeUserId,
        status: localTodo.status,
        recurrence: localTodo.recurrence,
        kanbanColumnId: localTodo.kanbanColumnId,
        kanbanPosition: localTodo.kanbanPosition,
        createdAt: localTodo.createdAt,
        updatedAt: localTodo.updatedAt,
        completedAt: localTodo.completedAt,
      }));
      setOfflinePendingSync(true);
      return localTodo;
    }

    let selectClause = supportsExtendedManualTodoFieldsRef.current
      ? MANUAL_TODO_SELECT
      : LEGACY_MANUAL_TODO_SELECT;
    let insertPayload = buildManualTodoInsertPayload(localTodoBase, userId, supportsExtendedManualTodoFieldsRef.current);
    let { data, error } = await supabase
      .from('manual_todos')
      .insert(insertPayload)
      .select(selectClause)
      .single();

    if (error && supportsExtendedManualTodoFieldsRef.current && isMissingSchemaFieldError(error, EXTENDED_MANUAL_TODO_FIELDS)) {
      supportsExtendedManualTodoFieldsRef.current = false;
      selectClause = LEGACY_MANUAL_TODO_SELECT;
      insertPayload = buildManualTodoInsertPayload(localTodoBase, userId, false);
      ({ data, error } = await supabase
        .from('manual_todos')
        .insert(insertPayload)
        .select(selectClause)
        .single());
    }

    if (!error && data) {
      const savedTodo = mapManualTodoRow(data);
      setTodos((prev) => [...prev, savedTodo]);
      return savedTodo;
    }

    if (isMissingRelationError(error, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      setTodos((prev) => [...prev, localTodoBase]);
      return localTodoBase;
    }

    if (error) {
      console.error('Failed to create manual todo:', error);
    }

    const localTodo = {
      ...localTodoBase,
      _id: createOfflineTempId('offline-todo'),
    };
    setTodos((prev) => [...prev, localTodo]);
    setTodoQueue((prev) => enqueueCreate(prev, {
      localId: localTodo._id,
      projectId: localTodo.projectId,
      title: localTodo.title,
      description: localTodo.description,
      dueDate: localTodo.dueDate,
      owner: localTodo.owner,
      assigneeUserId: localTodo.assigneeUserId,
      status: localTodo.status,
      recurrence: localTodo.recurrence,
      kanbanColumnId: localTodo.kanbanColumnId,
      kanbanPosition: localTodo.kanbanPosition,
      createdAt: localTodo.createdAt,
      updatedAt: localTodo.updatedAt,
      completedAt: localTodo.completedAt,
    }));
    setOfflinePendingSync(true);
    return localTodo;
  }, [isOnline, now, projectId, setOfflinePendingSync, userId]);

  const updateTodo = useCallback(async (todoId, key, value) => {
    const todo = todos.find((item) => item._id === todoId);
    if (!todo) return;

    const ts = now();
    const {
      localUpdated,
      followUpLocal,
      normalizedRecurrence,
      nextStatus,
      transitionedToDone,
      nextRecurringDueDate,
    } = buildLocalTodoUpdate({ todo, key, value, userId, ts });

    if (!userId || !supportsManualTodosTableRef.current) {
      setTodos((prev) => applyTodoUpdateToState(prev, todoId, localUpdated, followUpLocal));
      return;
    }

    const queuePatch = { updatedAt: localUpdated.updatedAt };
    if (key === 'title') queuePatch.title = localUpdated.title;
    if (key === 'description') queuePatch.description = localUpdated.description;
    if (key === 'dueDate') queuePatch.dueDate = localUpdated.dueDate;
    if (key === 'owner') queuePatch.owner = localUpdated.owner;
    if (key === 'projectId') queuePatch.projectId = localUpdated.projectId;
    if (key === 'assigneeUserId') queuePatch.assigneeUserId = localUpdated.assigneeUserId;
    if (key === 'recurrence') queuePatch.recurrence = localUpdated.recurrence;
    if (key === 'kanbanColumnId') queuePatch.kanbanColumnId = localUpdated.kanbanColumnId;
    if (key === 'kanbanPosition') queuePatch.kanbanPosition = localUpdated.kanbanPosition;
    if (key === 'kanbanMeta') {
      queuePatch.kanbanColumnId = localUpdated.kanbanColumnId;
      queuePatch.kanbanPosition = localUpdated.kanbanPosition;
    }
    if (key === 'status') {
      queuePatch.status = localUpdated.status;
      queuePatch.completedAt = localUpdated.completedAt || '';
    }

    if (!isOnline || isOfflineTempId(todoId)) {
      const queuedFollowUp = followUpLocal
        ? { ...followUpLocal, _id: createOfflineTempId('offline-todo') }
        : null;
      setTodos((prev) => applyTodoUpdateToState(prev, todoId, localUpdated, queuedFollowUp));
      setTodoQueue((prev) => {
        let nextQueue = enqueueUpdate(prev, todoId, queuePatch);
        if (queuedFollowUp) {
          nextQueue = enqueueCreate(nextQueue, {
            localId: queuedFollowUp._id,
            projectId: queuedFollowUp.projectId,
            title: queuedFollowUp.title,
            description: queuedFollowUp.description,
            dueDate: queuedFollowUp.dueDate,
            owner: queuedFollowUp.owner,
            assigneeUserId: queuedFollowUp.assigneeUserId,
            status: queuedFollowUp.status,
            recurrence: queuedFollowUp.recurrence,
            kanbanColumnId: queuedFollowUp.kanbanColumnId,
            kanbanPosition: queuedFollowUp.kanbanPosition,
            createdAt: queuedFollowUp.createdAt,
            updatedAt: queuedFollowUp.updatedAt,
            completedAt: queuedFollowUp.completedAt,
          });
        }
        return nextQueue;
      });
      setOfflinePendingSync(true);
      return;
    }

    const patch = buildTodoUpdatePatch({
      todo,
      key,
      value,
      normalizedRecurrence,
      nextStatus,
      ts,
    });

    let selectClause = supportsExtendedManualTodoFieldsRef.current
      ? MANUAL_TODO_SELECT
      : LEGACY_MANUAL_TODO_SELECT;
    let updatePayload = patch;
    let { data: updatedRow, error: updateError } = await supabase
      .from('manual_todos')
      .update(updatePayload)
      .eq('id', todoId)
      .select(selectClause)
      .single();

    if (updateError && supportsExtendedManualTodoFieldsRef.current && isMissingSchemaFieldError(updateError, EXTENDED_MANUAL_TODO_FIELDS)) {
      supportsExtendedManualTodoFieldsRef.current = false;
      selectClause = LEGACY_MANUAL_TODO_SELECT;
      updatePayload = buildManualTodoUpdatePayload(queuePatch, false);
      ({ data: updatedRow, error: updateError } = await supabase
        .from('manual_todos')
        .update(updatePayload)
        .eq('id', todoId)
        .select(selectClause)
        .single());
    }

    if (updateError && isMissingRelationError(updateError, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      setTodos((prev) => applyTodoUpdateToState(prev, todoId, localUpdated, followUpLocal));
      return;
    }

    if (updateError || !updatedRow) {
      console.error('Failed to update manual todo:', updateError);
      return;
    }

    let followUpDbRow = null;
    if (transitionedToDone && normalizedRecurrence) {
      const { data: insertedRow, error: insertError } = await supabase
        .from('manual_todos')
        .insert(buildRecurringFollowUpInsert({
          userId,
          localUpdated,
          normalizedRecurrence,
          nextRecurringDueDate,
          supportsExtendedFields: supportsExtendedManualTodoFieldsRef.current,
        }))
        .select(selectClause)
        .single();

      if (!insertError && insertedRow) {
        followUpDbRow = insertedRow;
      } else if (insertError) {
        if (supportsExtendedManualTodoFieldsRef.current && isMissingSchemaFieldError(insertError, EXTENDED_MANUAL_TODO_FIELDS)) {
          supportsExtendedManualTodoFieldsRef.current = false;
        }
        if (isMissingRelationError(insertError, 'manual_todos')) {
          supportsManualTodosTableRef.current = false;
        }
        console.error('Failed to create recurring follow-up todo:', insertError);
      }
    }

    setTodos((prev) => {
      const next = prev.map((item) => item._id === todoId ? mapManualTodoRow(updatedRow) : item);
      if (followUpDbRow) {
        next.push(mapManualTodoRow(followUpDbRow));
      } else if (followUpLocal) {
        next.push(followUpLocal);
      }
      return next;
    });
  }, [isOnline, now, setOfflinePendingSync, todos, userId]);

  const deleteTodo = useCallback(async (todoId) => {
    const previousTodos = todos;
    setTodos((prev) => prev.filter((todo) => todo._id !== todoId));

    if (!userId || !supportsManualTodosTableRef.current) return;

    if (!isOnline || isOfflineTempId(todoId)) {
      setTodoQueue((prev) => enqueueDelete(prev, todoId));
      setOfflinePendingSync(true);
      return;
    }

    const { error } = await supabase
      .from('manual_todos')
      .delete()
      .eq('id', todoId);

    if (error && isMissingRelationError(error, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      return;
    }
    if (error) {
      console.error('Failed to delete manual todo:', error);
      setTodos(previousTodos);
    }
  }, [isOnline, setOfflinePendingSync, todos, userId]);

  return {
    addTodo,
    deleteTodo,
    loadTodos,
    setTodoQueue,
    setTodos,
    todoQueue,
    todoQueueRef,
    updateTodo,
    todos,
  };
}
