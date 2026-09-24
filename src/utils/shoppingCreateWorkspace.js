import { createShoppingCreateOperations, shoppingCreateProgress } from './shoppingCreateOperation.js';
import { isMissingShoppingContributionRpc } from './shoppingContributionRpc.js';
import { createShoppingInputBatches } from './shoppingInputBatches.js';
import { listShoppingDraftHandoffs } from './shoppingDraftBatchRecovery.js';

export function shoppingCreateErrorMessage(error) {
  if (isMissingShoppingContributionRpc(error)) return 'Shopping sync is being updated. Your saved additions will stay on this device. Try again later.';
  if (error?.code === 'SHOPPING_DESIRED_CONFLICT') return 'This grocery changed while you were editing. Check its latest name and try again.';
  if (error?.code === 'SHOPPING_OPERATION_SETTLED') return 'This addition has finished saving. Refresh the list before changing it.';
  if (String(error?.code || '').startsWith('JOURNAL_STORAGE')) return 'Unable to save on this device. Keep your draft and try again.';
  if (error?.code === 'JOURNAL_OWNER_CHANGED') return 'Your session changed. Sign in again to sync your groceries.';
  if (error?.code === 'JOURNAL_DRAFT_HANDOFF_CONFLICT') return 'A saved draft conflicts with an existing addition. Its saved details are preserved; it has not been added again.';
  return 'Unable to sync this addition. It remains saved on this device; try again when your connection returns.';
}

// Acceptance batches and journal records describe the same work during handoff.
// Keep terminal records in the identity set so a retained receipt cannot make
// a completed/cancelled grocery appear pending again. This is display only;
// recovery still validates the complete original batch and reports conflicts.
export function shoppingCreatePendingState({ records = [], batches = [], errors = new Map(), projectId }) {
  const projectRecords = records.filter(record => record.projectId === projectId);
  const projectBatches = batches.filter(batch => batch.projectId === projectId);
  const represented = new Set(projectRecords.map(record => record.operationId));
  const pendingRecords = projectRecords.filter(record => !['settled', 'local_cancelled'].includes(shoppingCreateProgress(record).status));
  const missing = new Set();
  const pendingBatches = projectBatches.flatMap(batch => {
    const items = batch.items.filter(item => {
      if (represented.has(item.operationId) || missing.has(item.operationId)) return false;
      missing.add(item.operationId);
      return true;
    });
    return items.length ? [{ ...batch, items }] : [];
  });
  const batchErrors = new Set(projectBatches.map(batch => `batch:${batch.id}`));
  const visibleErrors = new Map([...errors].filter(([id]) => {
    if (id.startsWith('batch:')) return batchErrors.has(id);
    if (id.startsWith('refresh:')) return id === `refresh:${projectId}`;
    return ['storage', 'inputs', 'drafts'].includes(id) || represented.has(id);
  }));
  return { records: pendingRecords, batches: pendingBatches, errors: visibleErrors,
    pendingCount: new Set(pendingRecords.map(record => record.operationId)).size + missing.size };
}

// Pending contributions remain separate from shared groceries. Never replace
// a shared row with a historical receipt image, or match ownership by title.
export function projectShoppingCreates({ todos, records, projectId, refreshed = new Set() }) {
  const localIds = new Set(records.map(record => record.localId));
  const base = todos.filter(todo => !todo._shoppingOperationId && !localIds.has(todo._id));
  const pending = [];
  for (const record of records) {
    if (record.projectId !== projectId) continue;
    const progress = shoppingCreateProgress(record);
    if (progress.status === 'local_cancelled' || progress.desired.cancel) continue;
    const settled = progress.status === 'settled';
    if (settled && (refreshed.has(`${record.operationId}:${record.recordVersion}`)
      || base.some(todo => todo._id === progress.contribution?.row_id))) continue;
    pending.push({ _id: record.localId, projectId, assigneeUserId: record.userId,
      ...progress.desired, sourceType: record.desired.source.sourceType, sourceBatchId: record.desired.source.sourceBatchId,
      meta: record.desired.source.meta, createdAt: '', updatedAt: '', completedAt: null,
      _shoppingOperationId: record.operationId, _shoppingRevision: progress.revision,
      _shoppingStatus: progress.status, _shoppingReadOnly: settled });
  }
  return [...base, ...pending];
}

export function createShoppingCreateWorkspace({ journal, transport, getCurrentUserId, isOnline,
  onChange, onRefresh, createId = () => globalThis.crypto.randomUUID(), broadcast = () => {},
  getSelectedProjectId = () => null,
  inputBatches = createShoppingInputBatches({ userId: getCurrentUserId(), getCurrentUserId }) }) {
  const controller = createShoppingCreateOperations({ journal, supabaseClient: transport, getCurrentUserId, createIntentId: createId });
  let records = [];
  let batches = [];
  let closed = false;
  const ownerId = getCurrentUserId();
  const isCurrent = () => !closed && getCurrentUserId() === ownerId;
  let reloadTicket = 0;
  let busy = false;
  let requested = false;
  const errors = new Map();
  const refreshed = new Set();
  let draftBatches = [];
  const refreshNeeded = new Set();
  const refreshTickets = new Map();
  const publish = () => {
    if (isCurrent()) onChange({ records: structuredClone(records), batches: structuredClone([...batches, ...draftBatches]), errors: new Map(errors), refreshed: new Set(refreshed), busy });
  };
  const reload = async () => {
    const ticket = ++reloadTicket;
    const stored = await journal.list();
    if (!isCurrent()) return;
    let storedBatches, inputError;
    try { storedBatches = await inputBatches.list(); }
    catch (error) { inputError = error; }
    const projectId = getSelectedProjectId();
    let storedDrafts, draftError;
    try { storedDrafts = await listShoppingDraftHandoffs({ journal, userId: ownerId, projectId, getCurrentUserId }); }
    catch (error) { draftError = error; }
    // A delayed input read must not resurrect batches removed by a newer
    // reload, or publish into a closed/replaced account session.
    if (!isCurrent() || ticket !== reloadTicket) return;
    // Concurrent reads may finish out of order. A journal never removes these
    // records; retain the largest observed recordVersion for each operation.
    const latest = new Map(records.map(record => [record.operationId, record]));
    for (const record of stored) {
      shoppingCreateProgress(record);
      if (!latest.has(record.operationId) || latest.get(record.operationId).recordVersion < record.recordVersion) latest.set(record.operationId, record);
    }
    records = [...latest.values()];
    errors.delete('storage');
    if (inputError) errors.set('inputs', shoppingCreateErrorMessage(inputError));
    else { batches = storedBatches; errors.delete('inputs'); }
    if (projectId === getSelectedProjectId()) {
      if (draftError) errors.set('drafts', shoppingCreateErrorMessage(draftError));
      else { draftBatches = storedDrafts; errors.delete('drafts'); }
    }
    publish();
  };
  const recoverDrafts = async () => {
    const projectId = getSelectedProjectId();
    let pending;
    try { pending = await listShoppingDraftHandoffs({ journal, userId: ownerId, projectId, getCurrentUserId }); }
    catch (error) { if (isCurrent()) errors.set('drafts', shoppingCreateErrorMessage(error)); return false; }
    if (!isCurrent()) return false;
    let steps = 0;
    for (const batch of pending) {
      for (const item of batch.items) {
        if (!isCurrent()) return false;
        if (steps++ >= 100) return true;
        try {
          await controller.create({ operationId: item.operationId, projectId: batch.projectId,
            localId: `offline-${item.operationId}`, item });
        } catch (error) {
          if (isCurrent()) errors.set('drafts', shoppingCreateErrorMessage(error));
          return false; // Retain the complete batch; explicit retry resumes it.
        }
      }
    }
    if (isCurrent()) errors.delete('drafts');
    return false;
  };
  const recoverInputs = async () => {
    let pending;
    try { pending = await inputBatches.list(); }
    catch (error) { if (isCurrent()) errors.set('inputs', shoppingCreateErrorMessage(error)); return; }
    if (!isCurrent()) return;
    for (const batch of pending) {
      let complete = true;
      for (const item of batch.items) {
        if (!isCurrent()) return;
        try {
          // Exact creation replay checks immutable initialDesired and returns
          // the latest record even after another tab has edited or synced it.
          await controller.create({ operationId: item.operationId, projectId: batch.projectId,
            localId: `offline-${item.operationId}`, item });
        } catch (error) {
          if (closed || error.code === 'JOURNAL_OWNER_CHANGED') throw error;
          complete = false;
          errors.set(`batch:${batch.id}`, error.code === 'JOURNAL_OPERATION_EXISTS'
            ? `Check saved grocery “${item.title}”: its saved identity already has different details. Both records are preserved; it has not been added again.`
            : `“${item.title}” is saved on this device. Retry to finish adding it.`);
          // A storage outage must not spend one timeout per remaining item.
          break;
        }
      }
      if (complete) {
        if (!isCurrent()) return;
        try {
          await inputBatches.remove(batch);
          if (!isCurrent()) return;
          errors.delete(`batch:${batch.id}`);
        }
        catch (error) { errors.set(`batch:${batch.id}`, shoppingCreateErrorMessage(error)); }
      }
    }
  };
  const refresh = async projectId => {
    // Read current rows only. Capture terminal versions before the request;
    // later acknowledgements/edits still need their own fresh read.
    const terminal = records.filter(record => record.projectId === projectId && shoppingCreateProgress(record).status === 'settled');
    const ticket = (refreshTickets.get(projectId) || 0) + 1;
    refreshTickets.set(projectId, ticket);
    const rows = await transport.readProject(projectId);
    if (closed || refreshTickets.get(projectId) !== ticket) return;
    await onRefresh(projectId, rows);
    if (closed) return;
    terminal.forEach(record => refreshed.add(`${record.operationId}:${record.recordVersion}`));
    refreshNeeded.delete(projectId);
    errors.delete(`refresh:${projectId}`);
    publish();
  };
  const sync = async (attemptedFailures = new Set()) => {
    if (closed) return;
    if (busy) { requested = true; return; }
    busy = true;
    requested = false;
    publish();
    let continueBatch = false;
    try {
      await recoverInputs();
      continueBatch = await recoverDrafts();
      await reload();
      if (!isOnline()) return;
      for (let steps = 0; steps < 100 && !closed && isOnline(); steps++) {
        const record = records.find(item => !attemptedFailures.has(item.operationId)
          && ['pending_add', 'pending_change'].includes(shoppingCreateProgress(item).status));
        if (!record) break;
        try {
          const result = await controller.syncOnce(record.operationId);
          if (result.error) { errors.set(record.operationId, shoppingCreateErrorMessage(result.error)); attemptedFailures.add(record.operationId); }
          else {
            errors.delete(record.operationId);
            if (result.sent) refreshNeeded.add(record.projectId);
          }
        } catch (error) {
          if (closed || error?.code === 'JOURNAL_OWNER_CHANGED') throw error;
          errors.set(record.operationId, shoppingCreateErrorMessage(error)); attemptedFailures.add(record.operationId);
        }
        await reload();
      }
      for (const record of records) {
        if (shoppingCreateProgress(record).status === 'settled'
          && !refreshed.has(`${record.operationId}:${record.recordVersion}`)) refreshNeeded.add(record.projectId);
      }
      if (records.some(record => !attemptedFailures.has(record.operationId)
        && ['pending_add', 'pending_change'].includes(shoppingCreateProgress(record).status))) continueBatch = true;
      for (const projectId of refreshNeeded) {
        try { await refresh(projectId); }
        catch (error) {
          if (closed || error?.code === 'JOURNAL_OWNER_CHANGED') throw error;
          errors.set(`refresh:${projectId}`, 'Your changes reached the server, but the latest list could not load. Retry to refresh it.');
        }
      }
    } finally {
      busy = false;
      publish();
      // New local work or an unfinished bounded batch schedules another pass. Errors and state
      // notifications must not create an unbounded automatic retry loop.
      if ((requested || continueBatch) && !closed) {
        // A continuation shares failure exclusions, so a large failing queue
        // reaches every operation once and stops. Explicit new work/retry gets
        // a fresh cycle and can retry previous failures.
        const failures = requested ? new Set() : attemptedFailures;
        queueMicrotask(() => { void sync(failures).catch(() => {}); });
      }
    }
  };
  const changed = async () => {
    await reload();
    if (!isCurrent()) return;
    broadcast();
    if (isOnline()) { requested = true; void sync().catch(() => {}); }
  };
  return {
    reload, sync, refresh,
    add: async (projectId, items, { onAccepted = () => {}, draftGeneration = null } = {}) => {
      if (!isCurrent()) throw Object.assign(new Error('Shopping session changed.'), { code: 'JOURNAL_OWNER_CHANGED' });
      const prepared = items.map(item => ({ ...item, operationId: item.operationId || createId() }));
      await inputBatches.save(projectId, prepared, { draftGeneration });
      // Both synchronous and transactional stores must confirm acceptance
      // before input clearing or operation creation. Storage adapters retain
      // exact identities through uncertain completion; they must not re-key.
      if (!isCurrent()) return { cancelled: true, addedCount: 0, mergedCount: 0, queuedCount: 0, failedItems: [] };
      // From here failures retain the full batch, never restore a fresh add.
      try { onAccepted(); } catch { /* The accepted batch must never become a fresh failed input. */ }
      try { await recoverInputs(); }
      catch (error) { errors.set('inputs', shoppingCreateErrorMessage(error)); }
      try { await changed(); }
      catch (error) {
        // A failed display reload cannot turn already committed journal writes
        // back into unsaved inputs. Keep the exact per-item write outcomes.
        errors.set('storage', shoppingCreateErrorMessage(error)); publish();
      }
      return { addedCount: prepared.length, mergedCount: 0, queuedCount: prepared.length, failedItems: [] };
    },
    edit: async (todo, patch) => {
      // A user may start editing a pending row just before its reply arrives.
      // Keep contribution semantics for that captured pending identity; never
      // silently redirect the edit to the shared row returned by a merge.
      await controller.edit(todo._shoppingOperationId, todo._shoppingRevision, patch, { fromPendingView: true });
      errors.delete(todo._shoppingOperationId);
      await changed();
    },
    close: () => { closed = true; records = []; batches = []; draftBatches = []; errors.clear(); journal.close(); inputBatches.close(); },
  };
}
