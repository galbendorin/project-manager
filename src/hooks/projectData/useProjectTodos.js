import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useTaskCompletionSession } from '../../contexts/TaskCompletionSessionContext';
import { getCurrentDate } from '../../utils/helpers';
import {
  createLocalManualTodo,
  buildLocalTodoUpdate,
  applyTodoUpdateToState,
  buildTodoUpdatePatch,
} from './todos';
import {
  completeRecurringManualTodoAtomic,
  deriveRecurringFollowUpId,
  ensureRecurringManualTodoFollowUp,
  isValidRecurringUuid,
  recoverRecurringManualTodoFollowUp,
} from './recurringFollowUp';
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
  enqueueRecurringComplete,
  enqueueUpdate,
  removeQueuedTargetOps,
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

    if (op.kind === 'complete-recurring') {
      next = next.map((item) => (
        item._id === op.targetId ? applyManualTodoLocalPatch(item, op.patch) : item
      ));
      if (op.followUpLocalId && op.followUpRecord) {
        const queuedFollowUp = buildQueuedManualTodo(op.followUpLocalId, op.followUpRecord, now);
        const existingIndex = next.findIndex((item) => item._id === op.followUpLocalId);
        if (existingIndex === -1) {
          next.push(queuedFollowUp);
        } else {
          next[existingIndex] = queuedFollowUp;
        }
      }
      continue;
    }

    if (op.kind === 'delete') {
      next = next.filter((item) => item._id !== op.targetId);
    }
  }

  return next;
};

export function useProjectTodos({
  completionSession = null,
  isOnline,
  now,
  projectId,
  setLastSaved,
  setOfflinePendingSync,
  setUsingOfflineSnapshot,
  userId,
}) {
  const contextTaskSession = useTaskCompletionSession();
  const effectiveSession = completionSession || contextTaskSession;
  const [todos, setTodos] = useState([]);
  const [todoQueue, setTodoQueue] = useState([]);
  const [todoQueueRetryToken, setTodoQueueRetryToken] = useState(0);

  const supportsManualTodosTableRef = useRef(true);
  const supportsExtendedManualTodoFieldsRef = useRef(true);
  const supportsAtomicRecurringRpcRef = useRef(true);
  const todoQueueRef = useRef([]);
  const syncingTodoQueueRef = useRef(false);
  const todoQueueRetryTimeoutRef = useRef(null);
  const creationSession = useRef({ userId, active: true });
  if (creationSession.current.userId !== userId) {
    creationSession.current.active = false;
    creationSession.current = { userId, active: true };
  }
  useEffect(() => {
    const session = creationSession.current;
    session.active = true;
    return () => { session.active = false; };
  }, [userId]);

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
    const session = creationSession.current;
    const authScope = effectiveSession?.getScope?.() || null;
    const isQueueActive = () => (
      !cancelled
      && session.active
      && creationSession.current === session
      && (!effectiveSession || (authScope !== null && authScope.userId === userId && authScope.isCurrent()))
    );
    const advanceQueue = (updater) => {
      const next = updater(todoQueueRef.current);
      todoQueueRef.current = next;
      setTodoQueue(next);
    };
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
        while (isQueueActive() && todoQueueRef.current.length > 0) {
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
            if (!isQueueActive()) break;

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
              if (!isQueueActive()) break;
            }

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              advanceQueue(() => []);
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
            advanceQueue((prev) => replaceQueuedTargetId(prev.slice(1), previousId, savedTodo._id));
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
            if (!isQueueActive()) break;

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
              if (!isQueueActive()) break;
            }

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              advanceQueue(() => []);
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
            advanceQueue((prev) => prev.slice(1));
            setLastSaved(new Date());
            setUsingOfflineSnapshot(false);
            continue;
          }

          if (op.kind === 'complete-recurring') {
            const followUpId = deriveRecurringFollowUpId(op.targetId);
            const fallbackDate = op.fallbackDate || getCurrentDate();

            if (supportsAtomicRecurringRpcRef.current) {
              const rpcResult = await completeRecurringManualTodoAtomic({
                client: supabase,
                todoId: op.targetId,
                followUpId,
                fallbackDate,
                completedAt: op.completedAt || now(),
                isCurrent: isQueueActive,
              });
              if (!isQueueActive() || rpcResult.cancelled) break;

              if (rpcResult.ok) {
                const { updatedTodo, followUpTodo } = rpcResult;
                if (todoQueueRetryTimeoutRef.current) {
                  window.clearTimeout(todoQueueRetryTimeoutRef.current);
                  todoQueueRetryTimeoutRef.current = null;
                }
                setTodos((prev) => {
                  const mapped = prev
                    .filter((item) => !op.followUpLocalId || item._id !== op.followUpLocalId)
                    .map((item) => (item._id === op.targetId ? updatedTodo : item));
                  if (
                    followUpTodo
                    && (followUpTodo.projectId || null) === (projectId || null)
                    && !mapped.some((item) => item._id === followUpTodo._id)
                  ) {
                    mapped.push(followUpTodo);
                  }
                  return mapped;
                });
                advanceQueue((prev) => {
                  const rest = prev.slice(1);
                  if (!op.followUpLocalId) return rest;
                  return followUpTodo
                    ? replaceQueuedTargetId(rest, op.followUpLocalId, followUpTodo._id)
                    : removeQueuedTargetOps(rest, op.followUpLocalId);
                });
                setLastSaved(new Date());
                setUsingOfflineSnapshot(false);
                continue;
              }

              if (!rpcResult.missingRpc) {
                console.error('Failed to sync queued recurring todo completion:', rpcResult.error);
                scheduleRetry();
                break;
              }

              supportsAtomicRecurringRpcRef.current = false;
            }

            if (!isQueueActive()) break;

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
            if (!isQueueActive()) break;

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
              if (!isQueueActive()) break;
            }

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              advanceQueue(() => []);
              break;
            }

            if (error || !data) {
              console.error('Failed to sync queued recurring todo parent update:', error);
              scheduleRetry();
              break;
            }

            const updatedTodo = mapManualTodoRow(data);
            const followUpResult = await ensureRecurringManualTodoFollowUp({
              client: supabase,
              userId,
              followUpId,
              sourceTodo: { ...(op.sourceTodo || {}), ...updatedTodo },
              normalizedRecurrence: op.normalizedRecurrence,
              nextRecurringDueDate: op.nextRecurringDueDate || fallbackDate,
              supportsExtendedFields: supportsExtendedManualTodoFieldsRef.current,
              onSchemaFallback: () => {
                supportsExtendedManualTodoFieldsRef.current = false;
              },
              isCurrent: isQueueActive,
            });
            if (!isQueueActive() || followUpResult.cancelled) break;

            if (followUpResult.missingTable) {
              supportsManualTodosTableRef.current = false;
              advanceQueue(() => []);
              break;
            }

            if (!followUpResult.ok) {
              console.error('Failed to sync queued recurring follow-up todo:', followUpResult.error);
              scheduleRetry();
              break;
            }

            const { followUpTodo } = followUpResult;
            if (todoQueueRetryTimeoutRef.current) {
              window.clearTimeout(todoQueueRetryTimeoutRef.current);
              todoQueueRetryTimeoutRef.current = null;
            }
            setTodos((prev) => {
              const mapped = prev
                .filter((item) => !op.followUpLocalId || item._id !== op.followUpLocalId)
                .map((item) => (item._id === op.targetId ? updatedTodo : item));
              if (
                followUpTodo
                && (followUpTodo.projectId || null) === (projectId || null)
                && !mapped.some((item) => item._id === followUpTodo._id)
              ) {
                mapped.push(followUpTodo);
              }
              return mapped;
            });
            advanceQueue((prev) => {
              const rest = prev.slice(1);
              if (!op.followUpLocalId) return rest;
              return followUpTodo
                ? replaceQueuedTargetId(rest, op.followUpLocalId, followUpTodo._id)
                : removeQueuedTargetOps(rest, op.followUpLocalId);
            });
            setLastSaved(new Date());
            setUsingOfflineSnapshot(false);
            continue;
          }

          if (op.kind === 'delete') {
            const { error } = await supabase
              .from('manual_todos')
              .delete()
              .eq('id', op.targetId);
            if (!isQueueActive()) break;

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              advanceQueue(() => []);
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
            advanceQueue((prev) => prev.slice(1));
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
  }, [effectiveSession, isOnline, now, projectId, setLastSaved, setUsingOfflineSnapshot, todoQueue.length, todoQueueRetryToken, userId]);

  const addTodo = useCallback(async (todoData = {}, { requireConfirmation = false, operationId } = {}) => {
    const ts = now();
    const localTodoBase = createLocalManualTodo({ todoData, projectId, userId, ts });
    if (requireConfirmation && !isOnline) return null;

    // Personal planning needs a server acknowledgement. Retry the same UUID,
    // reconcile first, and never turn an ambiguous online result into a duplicate.
    if (requireConfirmation && isOnline) {
      if (!userId || !supportsManualTodosTableRef.current || !/^[0-9a-f-]{36}$/i.test(operationId || '')) return null;
      const session = creationSession.current;
      const active = () => session.active && creationSession.current === session;
      let select = `${supportsExtendedManualTodoFieldsRef.current ? MANUAL_TODO_SELECT : LEGACY_MANUAL_TODO_SELECT}, user_id`;
      const reconcile = async () => {
        const result = await supabase.from('manual_todos').select(select).eq('id', operationId).eq('user_id', userId).maybeSingle();
        if (result.error) throw new Error('Unable to confirm this task. Your draft is kept; retry when connected.');
        return result.data;
      };
      const publish = (row) => {
        if (!active() || row?.id !== operationId || row?.user_id !== userId) return null;
        const saved = { ...mapManualTodoRow(row), creationConfirmed: true };
        setTodos((previous) => [...previous.filter((item) => item._id !== saved._id), saved]);
        return saved;
      };
      let row = await reconcile();
      if (!active()) return null;
      if (row) return publish(row);
      let payload = { ...buildManualTodoInsertPayload(localTodoBase, userId, supportsExtendedManualTodoFieldsRef.current), id: operationId };
      let result = await supabase.from('manual_todos').insert(payload).select(select).single();
      if (!active()) return null;
      if (result.error && supportsExtendedManualTodoFieldsRef.current && isMissingSchemaFieldError(result.error, EXTENDED_MANUAL_TODO_FIELDS)) {
        supportsExtendedManualTodoFieldsRef.current = false;
        select = `${LEGACY_MANUAL_TODO_SELECT}, user_id`;
        payload = { ...buildManualTodoInsertPayload(localTodoBase, userId, false), id: operationId };
        result = await supabase.from('manual_todos').insert(payload).select(select).single();
      }
      if (!active()) return null;
      if (!result.error && result.data) return publish(result.data);
      row = await reconcile();
      if (row) return publish(row);
      const failure = new Error('Task was not confirmed. Your draft is kept; retry without creating another task.');
      failure.definiteRejection = /^(42501|22\w{3}|23\w{3})$/.test(result.error?.code || '') && result.error?.code !== '23505';
      throw failure;
    }

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

  const updateTodo = useCallback(async (todoId, key, value, todoOverride = null, { requireConfirmation = false, followUpOperationId = null, sessionScope = null } = {}) => {
    const todo = todoOverride || todos.find((item) => item._id === todoId);
    if (!todo) return null;
    if (requireConfirmation && (!userId || !supportsManualTodosTableRef.current || !isOnline || isOfflineTempId(todoId))) return null;

    const hookSession = creationSession.current;
    const authScope = sessionScope || effectiveSession?.getScope?.() || null;
    if (effectiveSession && (!authScope || authScope.userId !== userId || !authScope.isCurrent())) {
      return null;
    }
    const isCurrent = () => (
      hookSession.active
      && creationSession.current === hookSession
      && (!effectiveSession || (authScope !== null && authScope.isCurrent()))
      && (!sessionScope || sessionScope.isCurrent())
    );
    if (!isCurrent()) return null;

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
      return { updatedTodo: localUpdated, followUpTodo: followUpLocal };
    }

    const queuePatch = { updatedAt: localUpdated.updatedAt };
    if (key === 'title') queuePatch.title = localUpdated.title;
    if (key === 'description') queuePatch.description = localUpdated.description;
    if (key === 'dueDate') queuePatch.dueDate = localUpdated.dueDate;
    if (key === 'owner') queuePatch.owner = localUpdated.owner;
    if (key === 'projectId') { queuePatch.projectId = localUpdated.projectId; queuePatch.kanbanColumnId = null; }
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

    const fallbackDate = getCurrentDate();

    if (!isOnline || isOfflineTempId(todoId)) {
      const queuedFollowUp = followUpLocal
        ? { ...followUpLocal, _id: createOfflineTempId('offline-todo') }
        : null;
      setTodos((prev) => applyTodoUpdateToState(prev, todoId, localUpdated, queuedFollowUp));
      setTodoQueue((prev) => {
        if (transitionedToDone && normalizedRecurrence && queuedFollowUp) {
          return enqueueRecurringComplete(prev, {
            targetId: todoId,
            followUpLocalId: queuedFollowUp._id,
            patch: queuePatch,
            completedAt: localUpdated.completedAt || ts,
            fallbackDate,
            sourceTodo: localUpdated,
            normalizedRecurrence,
            nextRecurringDueDate,
            followUpRecord: {
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
            },
          });
        }
        return enqueueUpdate(prev, todoId, queuePatch);
      });
      setOfflinePendingSync(true);
      return { updatedTodo: localUpdated, followUpTodo: queuedFollowUp };
    }

    const followUpId = transitionedToDone && normalizedRecurrence
      ? (isValidRecurringUuid(followUpOperationId) ? followUpOperationId : deriveRecurringFollowUpId(todoId))
      : null;

    if (transitionedToDone && normalizedRecurrence && supportsAtomicRecurringRpcRef.current) {
      const rpcResult = await completeRecurringManualTodoAtomic({
        client: supabase,
        todoId,
        followUpId,
        fallbackDate,
        completedAt: localUpdated.completedAt || ts,
        isCurrent,
      });
      if (rpcResult.cancelled || !isCurrent()) {
        return null;
      }
      if (rpcResult.ok) {
        const { updatedTodo, followUpTodo } = rpcResult;
        setTodos((prev) => {
          const next = prev.map((item) => (item._id === todoId ? updatedTodo : item));
          if (
            followUpTodo
            && (followUpTodo.projectId || null) === (projectId || null)
            && !next.some((item) => item._id === followUpTodo._id)
          ) {
            next.push(followUpTodo);
          }
          return next;
        });
        return {
          updatedTodo,
          followUpTodo,
          confirmed: true,
          atomic: true,
        };
      }
      if (!rpcResult.missingRpc) {
        console.error('Failed to complete recurring manual todo atomically:', rpcResult.error);
        return null;
      }
      supportsAtomicRecurringRpcRef.current = false;
    }

    if (!isCurrent()) return null;

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
    if (key === 'projectId' && !supportsExtendedManualTodoFieldsRef.current) {
      updatePayload = { ...patch };
      delete updatePayload.kanban_column_id;
    }
    const saveUpdate = (payload, fields) => {
      let query = supabase.from('manual_todos').update(payload).eq('id', todoId);
      if (requireConfirmation && key === 'projectId') {
        query = todo.projectId ? query.eq('project_id', todo.projectId) : query.is('project_id', null);
        if (todo.updatedAt) query = query.eq('updated_at', todo.updatedAt);
      }
      return query.select(fields).single();
    };
    let { data: updatedRow, error: updateError } = await saveUpdate(updatePayload, selectClause);
    if (!isCurrent()) return null;

    if (updateError && supportsExtendedManualTodoFieldsRef.current && isMissingSchemaFieldError(updateError, EXTENDED_MANUAL_TODO_FIELDS)) {
      supportsExtendedManualTodoFieldsRef.current = false;
      if (!isCurrent()) return null;
      selectClause = LEGACY_MANUAL_TODO_SELECT;
      updatePayload = buildManualTodoUpdatePayload(queuePatch, false);
      ({ data: updatedRow, error: updateError } = await saveUpdate(updatePayload, selectClause));
      if (!isCurrent()) return null;
    }

    if (updateError && isMissingRelationError(updateError, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      if (requireConfirmation) return null;
      setTodos((prev) => applyTodoUpdateToState(prev, todoId, localUpdated, followUpLocal));
      return { updatedTodo: localUpdated, followUpTodo: followUpLocal };
    }

    if (updateError || !updatedRow || (requireConfirmation && (updatedRow.id !== todoId || (key === 'dueDate' && updatedRow.due_date !== value) || (key === 'projectId' && (updatedRow.project_id || null) !== (value || null))))) {
      console.error('Failed to update manual todo:', updateError);
      return null;
    }

    const updatedTodo = mapManualTodoRow(updatedRow);
    let followUpTodo = null;
    let followUpError = false;
    let followUpPending = null;
    let missingManualTodosOnInsert = false;

    if (transitionedToDone && normalizedRecurrence) {
      if (!isCurrent()) return null;

      const followUpResult = await ensureRecurringManualTodoFollowUp({
        client: supabase,
        userId,
        followUpId,
        sourceTodo: updatedTodo,
        normalizedRecurrence,
        nextRecurringDueDate,
        supportsExtendedFields: supportsExtendedManualTodoFieldsRef.current,
        onSchemaFallback: () => {
          supportsExtendedManualTodoFieldsRef.current = false;
        },
        isCurrent,
      });

      if (!isCurrent() || followUpResult.cancelled) {
        return null;
      }

      if (followUpResult.ok) {
        followUpTodo = followUpResult.followUpTodo;
      } else if (followUpResult.missingTable) {
        supportsManualTodosTableRef.current = false;
        missingManualTodosOnInsert = true;
        followUpTodo = followUpLocal;
      } else {
        followUpError = true;
        followUpPending = {
          id: followUpId,
          parentTodoId: todoId,
          userId,
          sourceTodo: updatedTodo,
          normalizedRecurrence,
          nextRecurringDueDate,
          fallbackDate,
          completedAt: updatedTodo.completedAt || ts,
          title: updatedTodo.title || 'Untitled',
          dueDate: nextRecurringDueDate || '',
        };
        console.error('Failed to create recurring follow-up todo:', followUpResult.error);
      }
    }

    if (!isCurrent()) return null;

    setTodos((prev) => {
      const next = prev.map((item) => (item._id === todoId ? updatedTodo : item));
      if (
        followUpTodo
        && (followUpTodo.projectId || null) === (projectId || null)
        && !next.some((item) => item._id === followUpTodo._id)
      ) {
        next.push(followUpTodo);
      }
      return next;
    });

    if (missingManualTodosOnInsert) {
      return { updatedTodo, followUpTodo };
    }

    return {
      updatedTodo,
      followUpTodo,
      confirmed: true,
      ...(followUpError ? { followUpError: true, followUpPending } : {}),
    };
  }, [effectiveSession, isOnline, now, projectId, setOfflinePendingSync, todos, userId]);

  const retryRecurringFollowUp = useCallback(async (pendingRecord, { sessionScope = null } = {}) => {
    const hookSession = creationSession.current;
    const authScope = sessionScope || effectiveSession?.getScope?.() || null;
    const isCurrent = () => (
      hookSession.active
      && creationSession.current === hookSession
      && (!effectiveSession || (authScope !== null && authScope.isCurrent()))
      && (!sessionScope || sessionScope.isCurrent())
    );
    if (!isCurrent() || !userId || pendingRecord?.userId !== userId) {
      return { ok: false, cancelled: true };
    }
    if (!isOnline) {
      return { ok: false, error: new Error('Reconnect to save the next recurring task.') };
    }

    const result = await recoverRecurringManualTodoFollowUp({
      client: supabase,
      userId,
      parentTodoId: pendingRecord.parentTodoId || pendingRecord.sourceTodo?._id || null,
      followUpId: pendingRecord.id,
      sourceTodo: pendingRecord.sourceTodo,
      normalizedRecurrence: pendingRecord.normalizedRecurrence,
      nextRecurringDueDate: pendingRecord.nextRecurringDueDate,
      fallbackDate: pendingRecord.fallbackDate || getCurrentDate(),
      completedAt: pendingRecord.completedAt || pendingRecord.sourceTodo?.completedAt || null,
      supportsAtomicRpc: supportsAtomicRecurringRpcRef.current,
      supportsExtendedFields: supportsExtendedManualTodoFieldsRef.current,
      onMissingAtomicRpc: () => {
        supportsAtomicRecurringRpcRef.current = false;
      },
      onSchemaFallback: () => {
        supportsExtendedManualTodoFieldsRef.current = false;
      },
      isCurrent,
    });

    if (!isCurrent() || result.cancelled) {
      return { ok: false, cancelled: true };
    }

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    if (result.updatedTodo || result.followUpTodo) {
      setTodos((prev) => {
        let next = result.updatedTodo
          ? prev.map((item) => (item._id === result.updatedTodo._id ? result.updatedTodo : item))
          : [...prev];
        if (
          result.followUpTodo
          && (result.followUpTodo.projectId || null) === (projectId || null)
          && !next.some((item) => item._id === result.followUpTodo._id)
        ) {
          next.push(result.followUpTodo);
        }
        return next;
      });
    }
    return {
      ok: true,
      updatedTodo: result.updatedTodo || null,
      followUpTodo: result.followUpTodo || null,
    };
  }, [effectiveSession, isOnline, projectId, userId]);

  const deleteTodo = useCallback(async (todoId) => {
    const previousTodos = todos;
    setTodos((prev) => prev.filter((todo) => todo._id !== todoId));

    if (!userId || !supportsManualTodosTableRef.current) return true;

    if (!isOnline || isOfflineTempId(todoId)) {
      setTodoQueue((prev) => enqueueDelete(prev, todoId));
      setOfflinePendingSync(true);
      return true;
    }

    const { error } = await supabase
      .from('manual_todos')
      .delete()
      .eq('id', todoId);

    if (error && isMissingRelationError(error, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      return true;
    }
    if (error) {
      console.error('Failed to delete manual todo:', error);
      setTodos(previousTodos);
      return false;
    }
    return true;
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
    retryRecurringFollowUp,
    todos,
  };
}
