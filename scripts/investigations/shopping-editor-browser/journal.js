import { createShoppingCreateJournal as createJournal } from '../../../src/utils/shoppingCreateJournal.js';
import { faults, evidence } from './environment.jsx';
export { ShoppingJournalError } from '../../../src/utils/shoppingCreateJournal.js';
export function createShoppingCreateJournal(options) {
  const journal = createJournal(options);
  const write = method => request => {
    if (faults.saves) throw Object.assign(new Error('Injected write failure'), { code: 'JOURNAL_STORAGE_UNAVAILABLE' });
    return journal.drafts[method](request);
  };
  return { ...journal, create: entry => {
    if (faults.handoffTitle && entry.desired.draft.title === faults.handoffTitle) {
      throw Object.assign(new Error('Injected grocery handoff failure'), { code: 'JOURNAL_STORAGE_UNAVAILABLE' });
    }
    return journal.create(entry);
  }, drafts: { ...journal.drafts, create: write('create'), update: write('update'),
    accept: async request => {
      evidence.acceptanceRequests.push(structuredClone(request));
      const result = await journal.drafts.accept(request);
      if (faults.holdAcceptance) await new Promise(resolve => { faults.release = resolve; });
      if (faults.loseAcceptance) { faults.loseAcceptance = false; throw new Error('Injected lost confirmation'); }
      return result;
    },
  } };
}
