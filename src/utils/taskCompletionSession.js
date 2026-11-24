import { deriveRecurringFollowUpId, isValidRecurringUuid } from '../hooks/projectData/recurringFollowUp.js';
import { buildRecurringRecoveryKey } from './offlineState.js';

const createSessionUuid = () => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const val = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return val.toString(16);
  });
};

const serializeRecovery = (item) => ({
  id: item.id,
  parentTodoId: item.parentTodoId || null,
  userId: item.userId,
  sourceTodo: item.sourceTodo || null,
  normalizedRecurrence: item.normalizedRecurrence || null,
  nextRecurringDueDate: item.nextRecurringDueDate || '',
  title: item.title || 'Untitled',
  dueDate: item.dueDate || '',
  error: item.error || `Completed “${item.title || 'Untitled'}”, but its next recurring occurrence did not save. Retry without creating a duplicate.`,
});

export function createTaskCompletionSession({
  initialUserId = null,
  storage = null,
  setTimer = (fn, delay) => (
    typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? window.setTimeout(fn, delay)
      : globalThis.setTimeout(fn, delay)
  ),
  clearTimer = (id) => (
    typeof window !== 'undefined' && typeof window.clearTimeout === 'function'
      ? window.clearTimeout(id)
      : globalThis.clearTimeout(id)
  ),
} = {}) {
  let current = null;
  let todoViewMounted = false;
  let alert = '';
  let listenersAttached = false;

  const pending = new Map();
  const projectQueues = new Map();
  const confirmedProjects = new Map();
  const recurringFollowUpIds = new Map();
  const recurringRecoveries = new Map();
  const listeners = new Set();
  const viewSinks = new Set();
  const manualResultListeners = new Set();

  let snapshot = Object.freeze({
    userId: null,
    scope: null,
    pendingEntries: [],
    recurringRecoveries: [],
    alert: '',
    todoViewMounted: false,
  });

  const resolveStorage = () => {
    if (storage) return storage;
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  };

  const persistRecoveriesForUser = (userId) => {
    const activeStorage = resolveStorage();
    if (!activeStorage || !userId) return;
    const key = buildRecurringRecoveryKey(userId);
    const records = [...recurringRecoveries.values()]
      .filter((item) => item?.userId === userId && item?.sourceTodo && item?.normalizedRecurrence)
      .map(serializeRecovery);
    try {
      if (records.length === 0) {
        activeStorage.removeItem(key);
      } else {
        activeStorage.setItem(key, JSON.stringify(records));
      }
    } catch {
      // Ignore storage quota / privacy mode errors.
    }
  };

  const clearPersistedRecoveries = (userId) => {
    const activeStorage = resolveStorage();
    if (!activeStorage || !userId) return;
    try {
      activeStorage.removeItem(buildRecurringRecoveryKey(userId));
    } catch {
      // Ignore storage access errors.
    }
  };

  const hydratePersistedRecoveries = (userId) => {
    const activeStorage = resolveStorage();
    if (!activeStorage || !userId) return;
    try {
      const raw = activeStorage.getItem(buildRecurringRecoveryKey(userId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (
          !item
          || !isValidRecurringUuid(item.id)
          || item.userId !== userId
          || !item.sourceTodo
          || !item.normalizedRecurrence
        ) {
          continue;
        }
        recurringRecoveries.set(item.id, {
          ...serializeRecovery(item),
          retrying: false,
          retry: null,
        });
      }
    } catch {
      // Ignore malformed persisted recovery state.
    }
  };

  const buildSnapshot = () => {
    snapshot = Object.freeze({
      userId: current?.userId || null,
      scope: current,
      pendingEntries: [...pending.values()].map((entry) => ({
        key: entry.key,
        todo: entry.todo,
        bucketKey: entry.bucketKey,
        displayIndex: entry.displayIndex,
        completedAt: entry.completedAt,
        committing: entry.committing,
        userId: entry.scope.userId,
      })),
      recurringRecoveries: [...recurringRecoveries.values()].map((item) => ({ ...item })),
      alert,
      todoViewMounted,
    });
  };

  const notify = () => {
    buildSnapshot();
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // Ignore subscriber errors during notification.
      }
    });
  };

  const detachPageListeners = () => {
    if (!listenersAttached) return;
    listenersAttached = false;
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('pagehide', handlePageHide);
    }
  };

  const detachIfIdle = () => {
    if (pending.size === 0) {
      detachPageListeners();
    }
  };

  const attachPageListeners = () => {
    if (listenersAttached || pending.size === 0) return;
    listenersAttached = true;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', handlePageHide);
    }
  };

  const runEntry = async (entry) => {
    if (entry.cancelled || entry.committing) return;
    if (!entry.scope.isCurrent()) {
      if (pending.get(entry.key) === entry) {
        pending.delete(entry.key);
        detachIfIdle();
        notify();
      }
      return;
    }

    entry.timerId = null;
    entry.committing = true;
    notify();

    let result = null;
    try {
      result = await Promise.resolve(entry.commit(entry.scope));
    } catch (error) {
      result = { ok: false, error: error?.message || 'Could not complete task. Try again.' };
    } finally {
      if (pending.get(entry.key) === entry) {
        pending.delete(entry.key);
        detachIfIdle();
      }
      if (entry.scope.isCurrent() && result && result.ok === false && !result.cancelled && result.error) {
        alert = result.error;
      }
      notify();
    }
  };

  function flushPending() {
    for (const entry of [...pending.values()]) {
      if (!entry.scope.isCurrent() || entry.committing || entry.cancelled) continue;
      if (entry.timerId !== null) {
        clearTimer(entry.timerId);
        entry.timerId = null;
      }
      void runEntry(entry);
    }
  }

  function handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      flushPending();
    }
  }

  function handlePageHide() {
    flushPending();
  }

  const clearEntry = (entry) => {
    entry.cancelled = true;
    if (entry.timerId !== null) {
      clearTimer(entry.timerId);
      entry.timerId = null;
    }
  };

  const revoke = ({ clearPersisted = false, userId: targetUserId = null } = {}) => {
    const previousUserId = targetUserId || current?.userId || null;
    current = null;
    for (const entry of pending.values()) {
      clearEntry(entry);
    }
    pending.clear();
    projectQueues.clear();
    confirmedProjects.clear();
    recurringFollowUpIds.clear();
    recurringRecoveries.clear();
    alert = '';
    detachPageListeners();
    if (clearPersisted && previousUserId) {
      clearPersistedRecoveries(previousUserId);
    }
    notify();
  };

  const setOwner = (userId) => {
    const normalized = userId ? String(userId).trim() : null;
    if (!normalized) {
      if (current !== null || pending.size > 0 || recurringRecoveries.size > 0 || alert) {
        revoke();
      }
      return null;
    }
    if (current?.userId === normalized) {
      return current;
    }
    revoke();
    const scope = Object.freeze({
      userId: normalized,
      isCurrent: () => current === scope,
    });
    current = scope;
    hydratePersistedRecoveries(normalized);
    notify();
    return scope;
  };

  const schedule = ({ key, todo, bucketKey, displayIndex = 0, delayMs = 0, commit }) => {
    const scope = current;
    if (!scope || !key || typeof commit !== 'function') return false;

    const existing = pending.get(key);
    if (existing) {
      if (existing.committing) return false;
      clearEntry(existing);
    }

    const entry = {
      key,
      todo,
      bucketKey,
      displayIndex,
      completedAt: todo?.completedAt || new Date().toISOString(),
      scope,
      delayMs,
      commit,
      timerId: null,
      committing: false,
      cancelled: false,
    };

    pending.set(key, entry);
    attachPageListeners();

    if (delayMs <= 0) {
      entry.timerId = setTimer(() => {
        void runEntry(entry);
      }, 0);
    } else {
      entry.timerId = setTimer(() => {
        void runEntry(entry);
      }, delayMs);
    }

    notify();
    return true;
  };

  const cancel = (key) => {
    const existing = pending.get(key);
    if (!existing || existing.committing) return false;
    clearEntry(existing);
    pending.delete(key);
    detachIfIdle();
    notify();
    return true;
  };

  const enqueueProjectMutation = (projectId, taskFn, expectedScope = current) => {
    if (!current || expectedScope !== current || !projectId || typeof taskFn !== 'function') {
      return Promise.resolve({ ok: false, cancelled: true });
    }
    const scope = expectedScope;
    const previous = projectQueues.get(projectId) || Promise.resolve();
    const run = previous
      .catch(() => null)
      .then(async () => {
        if (!scope.isCurrent()) {
          return { ok: false, cancelled: true };
        }
        return await taskFn(scope);
      });
    const tracked = run.finally(() => {
      if (projectQueues.get(projectId) === tracked) {
        projectQueues.delete(projectId);
      }
    });
    projectQueues.set(projectId, tracked);
    return tracked;
  };

  const getConfirmedProject = (projectId) => {
    if (!current || !projectId) return null;
    return confirmedProjects.get(projectId) || null;
  };

  const setConfirmedProject = (projectId, project, expectedScope = current) => {
    if (!current || expectedScope !== current || !projectId || !project) return;
    confirmedProjects.set(projectId, project);
  };

  const syncConfirmedProjects = (projects = [], expectedScope = current) => {
    if (!current || expectedScope !== current || !Array.isArray(projects)) return;
    for (const project of projects) {
      if (!project?.id) continue;
      const existing = confirmedProjects.get(project.id);
      if (!existing) {
        confirmedProjects.set(project.id, project);
        continue;
      }
      const nextVersion = Number.isInteger(project.version) ? project.version : null;
      const prevVersion = Number.isInteger(existing.version) ? existing.version : null;
      if (nextVersion !== null && (prevVersion === null || nextVersion > prevVersion || (!projectQueues.has(project.id) && nextVersion === prevVersion))) {
        confirmedProjects.set(project.id, project);
      }
    }
  };

  const getOrCreateRecurringFollowUpId = (todoId) => {
    if (!current || !todoId) return null;
    let id = recurringFollowUpIds.get(todoId);
    if (!id) {
      id = deriveRecurringFollowUpId(todoId) || createSessionUuid();
      recurringFollowUpIds.set(todoId, id);
    }
    return id;
  };

  const clearRecurringFollowUpId = (todoId) => {
    if (!todoId) return;
    recurringFollowUpIds.delete(todoId);
  };

  const recordRecurringRecovery = (record, expectedScope = current) => {
    if (!current || expectedScope !== current || !record?.id) return;
    const ownerId = record.userId || expectedScope?.userId || current.userId;
    recurringRecoveries.set(record.id, {
      ...serializeRecovery({ ...record, userId: ownerId }),
      retrying: Boolean(record.retrying),
      retry: typeof record.retry === 'function' ? record.retry : null,
    });
    persistRecoveriesForUser(ownerId);
    notify();
  };

  const setRecurringRecoveryRetrying = (id, retrying, expectedScope = current) => {
    if (!current || expectedScope !== current || !recurringRecoveries.has(id)) return;
    const prev = recurringRecoveries.get(id);
    recurringRecoveries.set(id, { ...prev, retrying: Boolean(retrying) });
    notify();
  };

  const clearRecurringRecovery = (id) => {
    if (!id || !recurringRecoveries.has(id)) return;
    const existing = recurringRecoveries.get(id);
    recurringRecoveries.delete(id);
    if (existing?.userId) {
      persistRecoveriesForUser(existing.userId);
    } else if (current?.userId) {
      persistRecoveriesForUser(current.userId);
    }
    notify();
  };

  const setAlert = (message, expectedScope = current) => {
    if (expectedScope && expectedScope !== current) return;
    const next = String(message || '').trim();
    if (alert === next) return;
    alert = next;
    notify();
  };

  const clearAlert = () => {
    if (!alert) return;
    alert = '';
    notify();
  };

  const setTodoViewMounted = (mounted) => {
    const next = Boolean(mounted) || viewSinks.size > 0;
    if (todoViewMounted === next) return;
    todoViewMounted = next;
    notify();
  };

  const registerViewSink = (sink) => {
    if (!sink) return () => {};
    viewSinks.add(sink);
    todoViewMounted = viewSinks.size > 0;
    notify();
    return () => {
      viewSinks.delete(sink);
      const next = viewSinks.size > 0;
      if (todoViewMounted !== next) {
        todoViewMounted = next;
        notify();
      }
    };
  };

  const notifyManualResult = (result, expectedScope = current) => {
    if (!current || expectedScope !== current || !result) return;
    viewSinks.forEach((sink) => {
      try {
        sink.onManualResult?.(result);
      } catch {
        // Ignore subscriber errors during notification.
      }
    });
    manualResultListeners.forEach((listener) => {
      try {
        listener(result, expectedScope);
      } catch {
        // Ignore subscriber errors during notification.
      }
    });
  };

  const subscribeManualResults = (listener) => {
    if (typeof listener !== 'function') return () => {};
    manualResultListeners.add(listener);
    return () => {
      manualResultListeners.delete(listener);
    };
  };

  const notifyProjectConfirmed = (project, expectedScope = current) => {
    if (!current || expectedScope !== current || !project?.id) return;
    viewSinks.forEach((sink) => {
      try {
        sink.onProjectConfirmed?.(project);
      } catch {
        // Ignore subscriber errors during notification.
      }
    });
  };

  const subscribe = (listener) => {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  if (initialUserId) {
    setOwner(initialUserId);
  } else {
    buildSnapshot();
  }

  return {
    getScope: () => current,
    getSnapshot: () => snapshot,
    subscribe,
    setOwner,
    revoke,
    dispose: revoke,
    schedule,
    cancel,
    flushPending,
    isPending: (key) => pending.has(key),
    enqueueProjectMutation,
    getConfirmedProject,
    setConfirmedProject,
    syncConfirmedProjects,
    getOrCreateRecurringFollowUpId,
    clearRecurringFollowUpId,
    recordRecurringRecovery,
    setRecurringRecoveryRetrying,
    clearRecurringRecovery,
    setAlert,
    clearAlert,
    setTodoViewMounted,
    registerViewSink,
    notifyManualResult,
    subscribeManualResults,
    notifyProjectConfirmed,
  };
}
