import { canonicalShoppingJournalJson as json, ShoppingJournalError } from './shoppingCreateJournal.js';
import { shoppingCreateInitialDesired, shoppingCreateProgress } from './shoppingCreateOperation.js';

const same = (a, b) => JSON.stringify(json(a)) === JSON.stringify(json(b));

// A retained batch is input acceptance evidence, not a second grocery row.
// Only exact operation-journal records authorize handoff completion. This
// reader never deletes batches/markers, restores text or allocates new IDs.
export async function listShoppingDraftHandoffs({ journal, userId, projectId, getCurrentUserId }) {
  const check = () => {
    if (!userId || getCurrentUserId() !== userId) throw new ShoppingJournalError('JOURNAL_OWNER_CHANGED');
  };
  check();
  if (!projectId || typeof journal.readAcceptedDrafts !== 'function') return [];
  const accepted = await journal.readAcceptedDrafts(projectId); check();
  if (!accepted.length) return [];
  const records = await journal.list(); check();
  const byId = new Map(records.map(record => [record.operationId, record]));
  const pending = [];
  for (const batch of accepted) {
    if (batch.userId !== userId || batch.projectId !== projectId) throw new ShoppingJournalError('JOURNAL_DRAFT_HANDOFF_CONFLICT');
    const missing = [];
    for (const item of batch.value.items) {
      const initial = shoppingCreateInitialDesired(item);
      const existing = byId.get(item.operationId);
      if (!existing) { missing.push(item); continue; }
      if (existing.userId !== userId || existing.projectId !== projectId || existing.localId !== `offline-${item.operationId}`
        || !same(existing.initialDesired ?? existing.desired, initial)) throw new ShoppingJournalError('JOURNAL_DRAFT_HANDOFF_CONFLICT');
      shoppingCreateProgress(existing);
    }
    if (missing.length) pending.push({ id: `draft:${batch.draftId}`, draftId: batch.draftId,
      draftVersion: batch.draftVersion, userId, projectId, items: json(missing) });
  }
  return pending;
}
