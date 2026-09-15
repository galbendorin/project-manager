import { createShoppingCreateJournal as createJournal } from '../../../src/utils/shoppingCreateJournal.js';
import { faults } from './environment.js';
export { ShoppingJournalError } from '../../../src/utils/shoppingCreateJournal.js';
export const evidence = { opened: 0, closed: 0 };
export function createShoppingCreateJournal(options) {
  const journal = createJournal(options); evidence.opened++;
  let closed = false;
  const write = method => request => {
    if (faults.saves) throw Object.assign(new Error('Injected write failure'), { code: 'JOURNAL_STORAGE_UNAVAILABLE' });
    return journal.drafts[method](request);
  };
  return { ...journal, drafts: { ...journal.drafts, create: write('create'), update: write('update') },
    close: () => { if (!closed) { closed = true; evidence.closed++; } journal.close(); },
  };
}
