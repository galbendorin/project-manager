import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createShoppingCreateJournal } from '../../../src/utils/shoppingCreateJournal.js';
import { useShoppingDraftSession } from '../../../src/hooks/useShoppingDraftSession.js';
import { createShoppingDraftRegistry } from '../../../src/utils/shoppingDraftRegistry.js';

const userId = 'r2b-synthetic-owner', projectId = 'r2b-synthetic-project';
const journal = createShoppingCreateJournal({ userId, getCurrentUserId: () => userId, includeDrafts: true });
const faults = { loseAcceptance: false, holdSave: false, release: null };
const hold = async () => {
  if (faults.holdSave) await new Promise(resolve => { faults.release = resolve; });
};
const repository = { ...journal.drafts,
  create: async request => { await hold(); return journal.drafts.create(request); },
  update: async request => { await hold(); return journal.drafts.update(request); },
  accept: async request => {
    const batch = await journal.drafts.accept(request);
    if (faults.loseAcceptance) { faults.loseAcceptance = false; throw Object.assign(new Error('Injected lost completion'), { code: 'JOURNAL_STORAGE_TIMEOUT' }); }
    return batch;
  },
};
const registry = createShoppingDraftRegistry({ repository, userId, getCurrentUserId: () => userId });
const grocery = (text, draftId) => ({ text, items: text.trim() ? [{ title: text, operationId: draftId,
  quantityValue: 2, quantityUnit: 'carton', meta: { note: 'preserved' } }] : [] });
function Editor({ existingId }) {
  const draft = useShoppingDraftSession({ registry, userId, projectId, draftId: existingId });
  const [result, setResult] = useState('');
  useEffect(() => {
    if (draft.draftId) history.replaceState(null, '', `?draft=${encodeURIComponent(draft.draftId)}`);
  }, [draft.draftId]);
  const run = async action => { try { setResult(JSON.stringify(await action())); } catch (error) { setResult(error.code || error.message); } };
  return <section>
    <label>Grocery draft <input aria-label="Grocery draft" value={draft.value.text} disabled={!draft.canEdit}
      onChange={event => draft.edit(grocery(event.target.value, draft.draftId))}/></label>
    <p role="status">{draft.phase}; {draft.saved ? 'Saved locally' : 'Not confirmed saved'}; {draft.error || 'No error'}</p>
    <button disabled={!draft.canEdit || !draft.value.items.length} onClick={() => run(draft.submit)}>Submit draft</button>
    <button onClick={() => run(draft.retry)}>Retry exact request</button>
    <button onClick={() => run(() => journal.drafts.compactAccepted({ projectId, draftId: draft.draftId,
      expectedVersion: draft.submission.expectedVersion + 1 }))}>Compact accepted head</button>
    <pre aria-label="Editor result">{result}</pre>
    <pre aria-label="Editor state">{JSON.stringify({ phase: draft.phase, draftId: draft.draftId, value: draft.value,
      submission: draft.submission, batch: draft.batch }, null, 2)}</pre>
  </section>;
}
function App() {
  const [mounted, setMounted] = useState(true), [stored, setStored] = useState('');
  const [existingId] = useState(new URL(location.href).searchParams.get('draft'));
  return <main><style>{'body{font:16px system-ui;margin:24px;max-width:900px}input{font:inherit;padding:10px;max-width:90%}button{padding:12px;margin:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere}'}</style>
    <h1>Transactional draft hook verification</h1><p>Synthetic local storage only. This is a test harness, not the Shopping interface.</p>
    <button onClick={() => { faults.loseAcceptance = true; setStored('Next acceptance will commit, then report a timeout.'); }}>Lose next acceptance confirmation</button>
    <button onClick={() => { faults.holdSave = true; setStored('Draft writes held.'); }}>Hold draft saves</button>
    <button onClick={() => { faults.holdSave = false; faults.release?.(); faults.release = null; }}>Release draft save</button>
    <button onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount editor' : 'Mount editor'}</button>
    <button onClick={async () => setStored(JSON.stringify({ drafts: await journal.drafts.list(projectId),
      accepted: await journal.drafts.listAccepted(projectId) }, null, 2))}>Inspect saved records</button>
    {mounted && <Editor existingId={existingId}/>}
    <pre aria-label="Saved records">{stored}</pre>
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
