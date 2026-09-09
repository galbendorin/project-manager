import { createShoppingCreateOperations, shoppingCreateProgress } from './shoppingCreateOperation.js';
import { isMissingShoppingContributionRpc } from './shoppingContributionRpc.js';
import { createShoppingInputBatches } from './shoppingInputBatches.js';

export function shoppingCreateErrorMessage(error) {
  if (isMissingShoppingContributionRpc(error)) return 'Shopping sync is being updated. Your saved additions will stay on this device. Try again later.';
  if (error?.code === 'SHOPPING_DESIRED_CONFLICT') return 'This grocery changed while you were editing. Check its latest name and try again.';
  if (error?.code === 'SHOPPING_OPERATION_SETTLED') return 'This addition has finished saving. Refresh the list before changing it.';
  if (String(error?.code || '').startsWith('JOURNAL_STORAGE')) return 'Unable to save on this device. Keep your draft and try again.';
  if (error?.code === 'JOURNAL_OWNER_CHANGED') return 'Your session changed. Sign in again to sync your groceries.';
  return 'Unable to sync this addition. It remains saved on this device; try again when your connection returns.';
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
  inputBatches = createShoppingInputBatches({ userId: getCurrentUserId(), getCurrentUserId }) }) {
  const controller = createShoppingCreateOperations({ journal, supabaseClient: transport, getCurrentUserId, createIntentId: createId });
  let records = [];
  let batches = [];
  let closed = false;
  let busy = false;
  let requested = false;
  const errors = new Map();
  const refreshed = new Set();
  const refreshNeeded = new Set();
  const refreshTickets = new Map();
  const publish = () => {
    if (!closed) onChange({ records: structuredClone(records), batches: structuredClone(batches), errors: new Map(errors), refreshed: new Set(refreshed), busy });
  };
  const reload = async () => {
    const stored = await journal.list();
    if (closed) return;
    // Concurrent reads may finish out of order. A journal never removes these
    // records; retain the largest observed recordVersion for each operation.
    const latest = new Map(records.map(record => [record.operationId, record]));
    for (const record of stored) {
      shoppingCreateProgress(record);
      if (!latest.has(record.operationId) || latest.get(record.operationId).recordVersion < record.recordVersion) latest.set(record.operationId, record);
    }
    records = [...latest.values()];
    errors.delete('storage');
    try { batches = inputBatches.list(); errors.delete('inputs'); }
    catch (error) { errors.set('inputs', shoppingCreateErrorMessage(error)); }
    publish();
  };
  const recoverInputs = async () => {
    let pending;
    try { pending = inputBatches.list(); }
    catch (error) { errors.set('inputs', shoppingCreateErrorMessage(error)); return; }
    for (const batch of pending) {
      let complete = true;
      for (const item of batch.items) {
        if (closed) return;
        try {
          // Exact creation replay checks immutable initialDesired and returns
          // the latest record even after another tab has edited or synced it.
          await controller.create({ operationId: item.operationId, projectId: batch.projectId,
            localId: `offline-${item.operationId}`, item });
        } catch (error) {
          if (closed || error.code === 'JOURNAL_OWNER_CHANGED') throw error;
          complete = false;
          errors.set(`batch:${batch.id}`, 'These groceries are saved on this device. Retry to finish adding them.');
          // A storage outage must not spend one timeout per remaining item.
          break;
        }
      }
      if (complete) {
        try { inputBatches.remove(batch); errors.delete(`batch:${batch.id}`); }
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
    broadcast();
    if (isOnline()) { requested = true; void sync().catch(() => {}); }
  };
  return {
    reload, sync, refresh,
    add: async (projectId, items, { onAccepted = () => {}, draftGeneration = null } = {}) => {
      const prepared = items.map(item => ({ ...item, operationId: item.operationId || createId() }));
      inputBatches.save(projectId, prepared, { draftGeneration });
      // Synchronous handoff occurs before any journal await or input clearing.
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
    close: () => { closed = true; records = []; batches = []; errors.clear(); journal.close(); inputBatches.close(); },
  };
}
