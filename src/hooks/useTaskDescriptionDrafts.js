import { useEffect, useRef, useState } from 'react';

// In-memory, account-scoped drafts survive closing/reopening the task editor.
// Description writes happen on blur/close, never on each keystroke.
export function useTaskDescriptionDrafts(owner, onUpdateTodo, onSaveResult) {
  const [, render] = useState(0);
  const lifecycle = useRef(null);
  if (!lifecycle.current || lifecycle.current.owner !== owner) {
    if (lifecycle.current) lifecycle.current.active = false;
    lifecycle.current = { owner, active: true, drafts: new Map() };
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
  const key = todo => `${todo.isDerived ? todo.source : 'manual'}:${todo._id}`;
  const read = todo => session.drafts.get(key(todo)) || { value: todo.description || '', status: '' };
  const change = (todo, value) => {
    if (!current()) return;
    let draft = session.drafts.get(key(todo));
    if (draft?.blocked) return;
    if (!draft) {
      draft = { value: todo.description || '', revision: 0, dirty: false, status: '' };
      session.drafts.set(key(todo), draft);
    }
    draft.value = value;
    draft.revision += 1;
    draft.dirty = true;
    draft.status = draft.pending ? 'saving' : 'dirty';
    notify();
  };
  const save = async todo => {
    if (!current()) return false;
    const draft = session.drafts.get(key(todo));
    if (draft?.blocked) return false;
    if (!draft?.dirty) return true;
    if (draft.pending) { draft.saveAgain = true; return draft.pending; }
    const value = draft.value, revision = draft.revision;
    draft.status = 'saving';
    // Assign the promise before invoking the callback, so blur + Close share it.
    draft.pending = Promise.resolve().then(() => current() ? update.current?.(todo._id, 'description', value) : null);
    notify();
    let saved = false;
    try {
      const result = await draft.pending;
      saved = result?.updatedTodo?._id === todo._id && result.updatedTodo.description === value;
    } catch { /* Failed text stays in the draft for retry. */ }
    if (!current()) return false;
    draft.pending = null;
    if (draft.blocked) return saved;
    if (draft.revision === revision) {
      draft.dirty = !saved;
      draft.status = saved ? '' : 'error';
      report.current?.(todo, saved);
      // Clean drafts follow later confirmed task refreshes.
      if (saved) session.drafts.delete(key(todo));
    } else {
      draft.status = 'dirty';
    }
    const saveAgain = draft.saveAgain;
    draft.saveAgain = false;
    notify();
    if (saveAgain && draft.dirty && draft.revision !== revision) return save(todo);
    return saved;
  };
  const prepareDelete = async todo => {
    let draft = session.drafts.get(key(todo));
    if (!draft) {
      draft = { value: todo.description || '', revision: 0, dirty: false, status: '' };
      session.drafts.set(key(todo), draft);
    }
    draft.blocked = true;
    try { await draft.pending; } catch { /* Delete may continue after a rejected save. */ }
    return current();
  };
  const finishDelete = (todo, deleted) => {
    if (!current()) return;
    if (deleted) session.drafts.delete(key(todo));
    else {
      const draft = session.drafts.get(key(todo));
      if (draft) { draft.blocked = false; draft.pending = null; draft.status = 'dirty'; }
    }
    notify();
  };
  return { read, change, save, prepareDelete, finishDelete };
}
