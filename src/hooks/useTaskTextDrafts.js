import { useEffect, useRef, useState } from 'react';

// In-memory, account-scoped drafts survive closing/reopening the task editor.
// Text writes happen on blur/close, never on each keystroke. Title/description
// writes share a task queue so their returned rows cannot race each other.
export function useTaskTextDrafts(owner, onUpdateTodo, onSaveResult) {
  const [, render] = useState(0);
  const lifecycle = useRef(null);
  if (!lifecycle.current || lifecycle.current.owner !== owner) {
    if (lifecycle.current) lifecycle.current.active = false;
    lifecycle.current = {
      owner,
      active: true,
      drafts: new Map(),
      queues: new Map(),
      deleting: new Set(),
      confirmedTodos: new Map(),
      confirmedFields: new Map(),
    };
  }
  const session = lifecycle.current;
  const update = useRef(onUpdateTodo);
  update.current = onUpdateTodo;
  const report = useRef(onSaveResult);
  report.current = onSaveResult;
  const current = () => session.active && lifecycle.current === session;
  const notify = () => { if (current()) render(n => n + 1); };
  useEffect(() => {
    session.active = true;
    return () => { session.active = false; };
  }, [session]);
  const taskKey = todo => `${todo.isDerived ? todo.source : 'manual'}:${todo._id}`;
  const key = (todo, field) => `${taskKey(todo)}:${field}`;
  const read = (todo, field = 'description') => session.drafts.get(key(todo, field)) || { value: todo[field] || '', status: '' };
  const change = (todo, value, field = 'description') => {
    if (!current() || session.deleting.has(taskKey(todo))) return;
    let draft = session.drafts.get(key(todo, field));
    if (draft?.blocked) return;
    if (!draft) {
      draft = { value: todo[field] || '', revision: 0, dirty: false, status: '' };
      session.drafts.set(key(todo, field), draft);
    }
    draft.value = value;
    draft.revision += 1;
    draft.dirty = true;
    draft.status = draft.pending ? 'saving' : 'dirty';
    notify();
  };
  const save = async (todo, field = 'description') => {
    if (!current() || session.deleting.has(taskKey(todo))) return false;
    const draft = session.drafts.get(key(todo, field));
    if (draft?.blocked) return false;
    if (!draft?.dirty) return true;
    if (field === 'title' && !draft.value.trim()) {
      draft.status = 'invalid';
      notify();
      report.current?.(todo, false, field);
      return false;
    }
    if (draft.pending) { draft.saveAgain = true; return draft.pending; }
    const value = draft.value, revision = draft.revision;
    draft.status = 'saving';
    // Assign the promise before invoking the callback, so blur + Close share it.
    const previous = session.queues.get(taskKey(todo)) || Promise.resolve();
    draft.pending = previous.catch(() => null).then(() => current() && !session.deleting.has(taskKey(todo)) ? update.current?.(todo._id, field, value) : null);
    const pending = draft.pending;
    session.queues.set(taskKey(todo), pending);
    notify();
    let saved = false;
    let savedRow = null;
    try {
      const result = await draft.pending;
      saved = result?.updatedTodo?._id === todo._id && result.updatedTodo[field] === value;
      if (saved) savedRow = result.updatedTodo;
    } catch { /* Failed text stays in the draft for retry. */ }
    if (!current()) return false;
    if (session.queues.get(taskKey(todo)) === pending) session.queues.delete(taskKey(todo));
    draft.pending = null;
    if (saved && savedRow) {
      const tKey = taskKey(todo);
      const prevConfirmed = session.confirmedTodos.get(tKey) || {};
      const fieldCache = session.confirmedFields.get(tKey) || {};
      fieldCache[field] = value;
      session.confirmedFields.set(tKey, fieldCache);
      session.confirmedTodos.set(tKey, {
        ...prevConfirmed,
        ...savedRow,
        ...fieldCache,
      });
    }
    if (draft.blocked) return saved;
    if (draft.revision === revision) {
      draft.dirty = !saved;
      draft.status = saved ? '' : 'error';
      report.current?.(todo, saved, field);
      // Clean drafts follow later confirmed task refreshes.
      if (saved) session.drafts.delete(key(todo, field));
    } else {
      draft.status = 'dirty';
    }
    const saveAgain = draft.saveAgain;
    draft.saveAgain = false;
    notify();
    if (saveAgain && draft.dirty && draft.revision !== revision) return save(todo, field);
    return saved;
  };
  const hasInvalidTitle = (todo) => {
    if (!todo || todo.isDerived || todo.planLink || todo.meta?.projectPlanLink) return false;
    const draft = session.drafts.get(key(todo, 'title'));
    return Boolean(draft && (draft.dirty || draft.status === 'invalid') && !draft.value.trim());
  };
  const hasUnsaved = (todo) => {
    if (!todo || todo.isDerived) return false;
    if (session.queues.has(taskKey(todo))) return true;
    const fields = todo.planLink || todo.meta?.projectPlanLink ? ['description'] : ['title', 'description'];
    return fields.some((field) => {
      const draft = session.drafts.get(key(todo, field));
      return Boolean(draft && (draft.dirty || draft.pending || draft.status === 'error' || draft.status === 'invalid'));
    });
  };
  const resolvedTodoFor = (todo) => {
    const tKey = taskKey(todo);
    const confirmed = session.confirmedTodos.get(tKey);
    const fieldCache = session.confirmedFields.get(tKey);
    if (!confirmed && !fieldCache) return todo;
    return {
      ...todo,
      ...(confirmed?.updatedAt ? { updatedAt: confirmed.updatedAt } : {}),
      ...(confirmed?.title !== undefined ? { title: confirmed.title } : {}),
      ...(confirmed?.description !== undefined ? { description: confirmed.description } : {}),
      ...(fieldCache || {}),
    };
  };
  const flushBeforeComplete = async (todo) => {
    if (!todo || todo.isDerived) return { ok: true, todo };
    if (!current() || session.deleting.has(taskKey(todo))) {
      return { ok: false, reason: 'unavailable' };
    }
    const tKey = taskKey(todo);
    const fields = todo.planLink || todo.meta?.projectPlanLink ? ['description'] : ['title', 'description'];

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const inFlight = session.queues.get(tKey);
      if (inFlight) {
        try {
          await inFlight;
        } catch {
          // Inspected via remaining draft state below.
        }
      }
      if (!current()) return { ok: false, reason: 'owner-changed' };
      if (session.deleting.has(tKey)) return { ok: false, reason: 'deleting' };

      let progressed = false;
      for (const field of fields) {
        const draft = session.drafts.get(key(todo, field));
        if (!draft || draft.blocked) continue;
        if (field === 'title' && !draft.value.trim()) {
          draft.status = 'invalid';
          notify();
          report.current?.(todo, false, 'title');
          return { ok: false, failedField: 'title', reason: 'invalid-title' };
        }
        if (draft.dirty && !draft.pending) {
          const ok = await save(todo, field);
          if (!current()) return { ok: false, reason: 'owner-changed' };
          if (!ok) {
            const currentDraft = session.drafts.get(key(todo, field));
            return {
              ok: false,
              failedField: field,
              reason: currentDraft?.status === 'invalid' ? 'invalid-title' : 'save-failed',
            };
          }
          progressed = true;
        }
      }

      const pendingQueue = session.queues.get(tKey);
      const moreDirty = fields.some((field) => {
        const draft = session.drafts.get(key(todo, field));
        return Boolean(draft && !draft.blocked && (draft.dirty || draft.pending));
      });
      if (!pendingQueue && !moreDirty) break;
      if (!progressed && !pendingQueue) break;
    }

    for (const field of fields) {
      const remaining = session.drafts.get(key(todo, field));
      if (remaining && (remaining.dirty || remaining.pending || remaining.status === 'error' || remaining.status === 'invalid')) {
        return {
          ok: false,
          failedField: field,
          reason: remaining.status === 'invalid' ? 'invalid-title' : 'save-failed',
        };
      }
    }

    return { ok: true, todo: resolvedTodoFor(todo) };
  };
  const prepareDelete = async todo => {
    session.deleting.add(taskKey(todo));
    for (const field of ['description', 'title']) {
      const draft = session.drafts.get(key(todo, field));
      if (draft) draft.blocked = true;
    }
    try { await session.queues.get(taskKey(todo)); } catch { /* Delete may continue after a rejected save. */ }
    return current();
  };
  const finishDelete = (todo, deleted) => {
    if (!current()) return;
    const tKey = taskKey(todo);
    session.deleting.delete(tKey);
    for (const field of ['description', 'title']) {
      if (deleted) session.drafts.delete(key(todo, field));
      else {
        const draft = session.drafts.get(key(todo, field));
        if (draft) { draft.blocked = false; draft.pending = null; draft.status = draft.dirty ? 'dirty' : ''; }
      }
    }
    if (deleted) {
      session.confirmedTodos.delete(tKey);
      session.confirmedFields.delete(tKey);
    }
    notify();
  };
  return {
    read,
    change,
    save,
    prepareDelete,
    finishDelete,
    hasUnsaved,
    hasInvalidTitle,
    flushBeforeComplete,
  };
}
