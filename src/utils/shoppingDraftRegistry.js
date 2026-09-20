import { createShoppingDraftSession } from './shoppingDraftSession.js';
import { ShoppingJournalError } from './shoppingCreateJournal.js';

const closedSnapshot = () => ({ phase: 'closed', error: null, value: { text: '', items: [] }, canEdit: false, saved: false });
const fail = code => { throw new ShoppingJournalError(code); };
const id = value => {
  if (typeof value !== 'string' || !value.trim()) fail('JOURNAL_ID_REQUIRED');
  return value;
};

// The authenticated owner, ABOVE route/editor mounts, owns this registry and
// its stable repository. Detaching a view never closes a draft or starts a
// cleanup-time save. The owner MUST close it on sign-out/session replacement,
// even if that account later returns, and then close its journal connection.
// This retains RAM across in-app navigation only, not browser/process loss.
export function createShoppingDraftRegistry({ repository, userId, getCurrentUserId,
  createId = () => globalThis.crypto.randomUUID(), maxSessions = 100 }) {
  id(userId);
  if (!repository || typeof getCurrentUserId !== 'function') fail('JOURNAL_OWNER_GUARD_REQUIRED');
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) fail('JOURNAL_DRAFT_LIMIT_INVALID');
  const entries = new Map(), current = new Map();
  let closed = false;
  const notify = (listeners, snapshot, isCurrent = () => true) => {
    for (const listener of [...listeners]) {
      if (!isCurrent()) break;
      if (!listeners.has(listener)) continue;
      try { listener(structuredClone(snapshot)); } catch { /* Observers cannot change storage decisions. */ }
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    const old = [...entries.values()];
    entries.clear(); current.clear();
    for (const entry of old) entry.session.close();
    for (const entry of old) { notify(entry.listeners, closedSnapshot()); entry.listeners.clear(); }
  };
  const owner = () => {
    if (!closed && getCurrentUserId() !== userId) close();
    return closed ? '' : userId;
  };
  const check = () => { if (!owner()) fail('JOURNAL_OWNER_CHANGED'); };
  const open = (projectId, existingId = null) => {
    check(); id(projectId);
    const draftId = existingId === null ? id(createId()) : id(existingId);
    const key = JSON.stringify([projectId, draftId]);
    if (entries.has(key)) {
      // A generated collision cannot silently turn new input into an old draft.
      if (existingId === null) fail('JOURNAL_DRAFT_EXISTS');
      return entries.get(key);
    }
    // Accepted, detached sessions can be recovered from their immutable batch.
    // Release only their RAM; never evict failed/uncertain or unsent input.
    if (entries.size >= maxSessions) {
      for (const [oldKey, entry] of entries) {
        if (!entry.listeners.size && entry.session.snapshot().phase === 'accepted') {
          entry.session.close(); entries.delete(oldKey);
          if (entries.size < maxSessions) break;
        }
      }
    }
    if (entries.size >= maxSessions) fail('JOURNAL_DRAFT_LIMIT');
    const listeners = new Set();
    let publication = 0;
    const session = createShoppingDraftSession({ repository, userId, projectId, getCurrentUserId: owner,
      createId: () => draftId, onChange: snapshot => {
        const revision = ++publication;
        // A subscriber can synchronously edit and publish newer state. Do not
        // deliver this older snapshot after that nested publication.
        notify(listeners, snapshot, () => revision === publication);
      } });
    const entry = { session, listeners, draftId };
    entries.set(key, entry);
    // Recover only once, including failed recovery. Reattaching must not
    // overwrite newer RAM from an older persisted head; Retry is explicit.
    void session.recover(existingId).catch(() => {});
    return entry;
  };
  return {
    close,
    startNew: projectId => {
      const entry = open(projectId);
      current.set(projectId, entry.draftId);
      return entry.draftId;
    },
    // RAM entries supplement a future saved-draft picker, including input
    // whose first write failed and therefore does not appear in repository.list.
    list: projectId => {
      check(); id(projectId);
      return [...entries.values()].map(entry => entry.session.snapshot())
        .filter(snapshot => snapshot.projectId === projectId);
    },
    attach: ({ userId: requestedOwner, projectId, draftId = null, onChange = () => {} }) => {
      check();
      if (requestedOwner !== userId) fail('JOURNAL_OWNER_CHANGED');
      id(projectId);
      const selected = draftId === null ? (current.get(projectId) ?? null) : id(draftId);
      const entry = open(projectId, selected);
      current.set(projectId, entry.draftId);
      let attached = true;
      // Each attachment has its own identity even if callbacks are identical.
      const listener = snapshot => { if (attached) onChange(snapshot); };
      entry.listeners.add(listener);
      const active = () => { check(); if (!attached) fail('JOURNAL_DRAFT_DETACHED'); };
      const invoke = (method, ...args) => { active(); return entry.session[method](...args); };
      return {
        snapshot: () => invoke('snapshot'),
        edit: value => invoke('edit', value),
        flush: () => invoke('flush'),
        submit: () => invoke('submit'),
        retry: () => invoke('retry'),
        detach: () => { attached = false; entry.listeners.delete(listener); },
      };
    },
  };
}
