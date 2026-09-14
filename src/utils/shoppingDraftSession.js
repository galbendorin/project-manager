import { canonicalShoppingJournalJson as json, ShoppingJournalError } from './shoppingCreateJournal.js';

const same = (a, b) => JSON.stringify(json(a)) === JSON.stringify(json(b));
const fail = code => { throw new ShoppingJournalError(code); };
const draftValue = value => {
  const copy = json(value);
  if (!copy || typeof copy.text !== 'string' || !Array.isArray(copy.items)
    || copy.items.some(item => !item || typeof item.title !== 'string' || !item.title.trim()
      || typeof item.operationId !== 'string' || !item.operationId.trim())
    || new Set(copy.items.map(item => item.operationId)).size !== copy.items.length) fail('JOURNAL_DRAFT_INVALID');
  return copy;
};
const conflictCodes = new Set(['JOURNAL_DRAFT_CONFLICT', 'JOURNAL_DRAFT_ACCEPTED', 'JOURNAL_DRAFT_RETIRED',
  'JOURNAL_DRAFT_EXISTS', 'JOURNAL_DRAFT_MISSING']);

// One editor lineage. No network, localStorage import, automatic fork, or
// callback that can misclassify uncertain acceptance as fresh failed input.
export function createShoppingDraftSession({ repository, userId, projectId, getCurrentUserId,
  onChange = () => {}, createId = () => globalThis.crypto.randomUUID() }) {
  if (!userId || !projectId || typeof getCurrentUserId !== 'function') fail('JOURNAL_ID_REQUIRED');
  let closed = false, opened = false, phase = 'opening', error = null;
  let draftId = null, record = null, value = { text: '', items: [] };
  let pendingWrite = null, writeFlight = null, submitFlight = null, barrier = false;
  let submission = null, batch = null;
  const active = () => {
    if (!closed && getCurrentUserId() !== userId) closed = true;
    return !closed;
  };
  const check = () => { if (!active()) fail('JOURNAL_OWNER_CHANGED'); };
  const snapshot = () => active() ? structuredClone({ phase, error, userId, projectId, draftId, value,
    recordVersion: record?.recordVersion ?? null, submission, batch,
    saved: Boolean(batch || (record?.state === 'editing' && !pendingWrite && same(record.value, value))),
    canEdit: opened && !barrier && ['editing', 'saving', 'save_failed'].includes(phase),
  }) : { phase: 'closed', error: null, value: { text: '', items: [] }, canEdit: false, saved: false };
  const publish = () => {
    if (active()) { try { onChange(snapshot()); } catch { /* UI observers cannot alter storage decisions. */ } }
  };
  const failed = (cause, fallback) => {
    if (!active()) return;
    phase = conflictCodes.has(cause?.code) ? 'conflict' : fallback;
    error = cause?.code || 'JOURNAL_STORAGE_FAILED'; publish();
  };
  const acceptResult = result => {
    if (result.userId !== userId || result.projectId !== projectId || result.draftId !== draftId
      || result.draftVersion !== submission.expectedVersion || !same(result.value, submission.value)) {
      fail('JOURNAL_DRAFT_CONFLICT');
    }
    batch = json(result); phase = 'accepted'; error = null; publish();
    return { status: 'accepted', batch: structuredClone(batch) };
  };
  const flush = () => {
    check();
    if (writeFlight) return writeFlight;
    if (!opened || !['editing', 'saving', 'save_failed', 'submitting'].includes(phase) || submission) {
      return Promise.reject(new ShoppingJournalError('JOURNAL_DRAFT_NOT_EDITABLE'));
    }
    writeFlight = Promise.resolve().then(async () => {
      while (pendingWrite || !record || !same(record.value, value)) {
        check();
        // Keep the request after rejection. A later edit changes only RAM,
        // never this expected version, create identity or retry payload.
        pendingWrite ||= { method: record ? 'update' : 'create', request: {
          projectId, draftId, value: json(value), ...(record ? { expectedVersion: record.recordVersion } : {}),
        } };
        phase = barrier ? 'submitting' : 'saving'; error = null; publish();
        const saved = await repository[pendingWrite.method](structuredClone(pendingWrite.request));
        check();
        if (saved.userId !== userId || saved.projectId !== projectId || saved.draftId !== draftId
          || saved.state !== 'editing' || !same(saved.value, pendingWrite.request.value)) fail('JOURNAL_DRAFT_CONFLICT');
        record = json(saved); pendingWrite = null;
      }
      return structuredClone(record);
    }).then(saved => {
      // Completion observers may immediately edit/submit. Release this flight
      // first so their new input gets its own write instead of joining a
      // promise which can no longer drain it.
      writeFlight = null; check();
      // An edit can also land between the drain resolving and this handler.
      // Its caller joined the old flight, so explicitly drain that newer value.
      if (pendingWrite || !record || !same(record.value, value)) return flush();
      phase = barrier ? 'submitting' : 'editing'; error = null; publish();
      return saved;
    }, cause => {
      writeFlight = null; failed(cause, 'save_failed'); throw cause;
    });
    return writeFlight;
  };
  const submit = () => {
    check();
    if (submitFlight) return submitFlight;
    if (phase === 'accepted') return Promise.resolve({ status: 'accepted', batch: structuredClone(batch) });
    if (!opened || !['editing', 'saving', 'save_failed', 'submitting', 'acceptance_unknown'].includes(phase)) {
      return Promise.resolve({ status: 'conflict' });
    }
    if (!submission && !value.items.length) return Promise.resolve({ status: 'empty' });
    // Freeze the clicked input before the first await. This editor is locked
    // until the decision resolves; independent new input needs its own session.
    barrier = true; phase = 'submitting'; error = null;
    submitFlight = Promise.resolve().then(async () => {
      try {
        check(); publish();
        if (!submission) {
          try { await flush(); }
          catch (cause) {
            check(); barrier = false; failed(cause, 'save_failed');
            return { status: phase === 'conflict' ? 'conflict' : 'not_submitted', error };
          }
          check();
          submission = { userId, projectId, draftId, expectedVersion: record.recordVersion, value: json(record.value) };
        }
        const accepted = await repository.accept({ projectId, draftId, expectedVersion: submission.expectedVersion });
        check(); return acceptResult(accepted);
      } catch (cause) {
        check();
        // Even an abort is conservatively unresolved here. Retain the exact
        // reference and offer retry; never return groceries as failedItems.
        failed(cause, 'acceptance_unknown');
        return { status: phase === 'conflict' ? 'conflict' : 'acceptance_unknown', error };
      }
    }).finally(() => { submitFlight = null; });
    return submitFlight;
  };
  const recover = async (existingId = null, retrying = false) => {
      check();
      if (opened && !retrying) fail('JOURNAL_DRAFT_ALREADY_OPEN');
      if (!opened) { opened = true; draftId = existingId ?? createId(); }
      phase = 'opening'; error = null; publish();
      try {
        if (existingId !== null) {
          record = await repository.read(projectId, draftId); check();
          if (!record) fail('JOURNAL_DRAFT_MISSING');
          if (record.state === 'accepted') {
            // A compacted head intentionally lacks value. Read the retained
            // batch via exact version replay, never create from old text.
            barrier = true;
            const accepted = await repository.accept({ projectId, draftId, expectedVersion: record.recordVersion - 1 });
            check(); value = draftValue(accepted.value);
            submission = { userId, projectId, draftId, expectedVersion: record.recordVersion - 1, value: json(value) };
            acceptResult(accepted); return snapshot();
          }
          value = draftValue(record.value);
        }
        phase = 'editing'; error = null; publish(); return snapshot();
      } catch (cause) { failed(cause, 'recovery_failed'); throw cause; }
  };
  return {
    snapshot, recover: existingId => recover(existingId),
    edit: next => {
      check();
      if (!snapshot().canEdit) fail('JOURNAL_DRAFT_NOT_EDITABLE');
      value = draftValue(next);
      void flush().catch(() => {}); publish();
    },
    flush, submit,
    retry: () => phase === 'recovery_failed' ? recover(draftId, true) : submission ? submit() : flush(),
    close: () => { closed = true; value = { text: '', items: [] }; record = null; batch = null; },
  };
}
