import { createShoppingCreateJournal, ShoppingJournalError } from './shoppingCreateJournal.js';
import { createShoppingDraftRegistry } from './shoppingDraftRegistry.js';

// AuthProvider owns this manager above all routes. Each accepted owner lineage
// gets an immutable capability; a stale consumer cannot acquire a later user's
// registry, including sign-out followed by sign-in to the same account.
export function createShoppingDraftOwner({ enabled = false, initialUserId = null,
  createJournal = createShoppingCreateJournal, createRegistry = createShoppingDraftRegistry } = {}) {
  let current = null, runtime = null;
  const invalid = () => { throw new ShoppingJournalError('JOURNAL_OWNER_CHANGED'); };
  const close = () => {
    const previous = runtime;
    current = null; runtime = null;
    // Invalidate capabilities before observers run, and close the connection
    // even if an injected registry's cleanup fails.
    try { previous?.registry.close(); } finally { previous?.journal.close(); }
  };
  const setOwner = userId => {
    if (userId !== null && (typeof userId !== 'string' || !userId.trim())) {
      throw new ShoppingJournalError('JOURNAL_ID_REQUIRED');
    }
    if (current?.userId === userId) return current;
    close();
    if (userId === null) return null;
    const scope = Object.freeze({ userId, enabled,
      acquire: () => {
        if (current !== scope) invalid();
        if (!enabled) throw new ShoppingJournalError('JOURNAL_DRAFT_DISABLED');
        if (runtime) return runtime.public;
        let journal;
        try {
          journal = createJournal({ userId, getCurrentUserId: () => current === scope ? userId : '', includeDrafts: true });
          const registry = createRegistry({ repository: journal.drafts, userId,
            getCurrentUserId: () => current === scope ? userId : '' });
          if (current !== scope) { registry.close(); invalid(); }
          runtime = { journal, registry, public: Object.freeze({ registry, repository: journal.drafts }) };
          return runtime.public;
        } catch (cause) { journal?.close(); throw cause; }
      },
    });
    current = scope;
    return scope;
  };
  setOwner(initialUserId);
  return { setOwner, close, getScope: () => current };
}
