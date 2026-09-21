import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createShoppingCreateJournal } from '../../../src/utils/shoppingCreateJournal.js';
import { createShoppingDraftRegistry } from '../../../src/utils/shoppingDraftRegistry.js';
import { useShoppingDraftSession } from '../../../src/hooks/useShoppingDraftSession.js';

// Synthetic origin only. The owner runtime deliberately lives ABOVE Editor.
const userId = 'navigation-fixture-owner';
let owner = userId;
const faults = { saves: false, acceptance: false };
const journal = createShoppingCreateJournal({ userId, getCurrentUserId: () => owner, includeDrafts: true });
const timeout = () => Object.assign(new Error('Injected lost confirmation'), { code: 'JOURNAL_STORAGE_TIMEOUT' });
const repository = { ...journal.drafts,
  create: request => { if (faults.saves) throw timeout(); return journal.drafts.create(request); },
  update: request => { if (faults.saves) throw timeout(); return journal.drafts.update(request); },
  accept: async request => {
    const batch = await journal.drafts.accept(request);
    if (faults.acceptance) { faults.acceptance = false; throw timeout(); }
    return batch;
  },
};
const registry = createShoppingDraftRegistry({ repository, userId, getCurrentUserId: () => owner });
const grocery = (text, draftId) => ({ text, items: text.trim() ? [{ title: text, operationId: draftId,
  quantityValue: 2, quantityUnit: 'carton', meta: { note: 'preserved' } }] : [] });

function Editor({ projectId, draftId }) {
  const draft = useShoppingDraftSession({ registry, userId, projectId, draftId });
  const [result, setResult] = useState('');
  useEffect(() => {
    if (draft.draftId) history.replaceState(null, '', `?project=${encodeURIComponent(projectId)}&draft=${encodeURIComponent(draft.draftId)}`);
  }, [projectId, draft.draftId]);
  const run = async action => {
    try { setResult(JSON.stringify(await action())); } catch (cause) { setResult(cause.code || cause.message); }
  };
  return <section>
    <label>Grocery draft <input aria-label="Grocery draft" disabled={!draft.canEdit} value={draft.value.text}
      onChange={event => draft.edit(grocery(event.target.value, draft.draftId))}/></label>
    <p role="status">{draft.phase}; {draft.saved ? 'Saved locally' : 'Not confirmed saved'}; {draft.error || 'No error'}</p>
    <button disabled={!draft.canEdit || !draft.value.items.length} onClick={() => run(draft.submit)}>Submit draft</button>
    <button onClick={() => run(draft.retry)}>Retry exact request</button>
    <pre aria-label="Draft identity">{JSON.stringify({ projectId, draftId: draft.draftId, phase: draft.phase,
      value: draft.value, submission: draft.submission }, null, 2)}</pre>
    <pre aria-label="Action result">{result}</pre>
  </section>;
}

function App() {
  const params = new URL(location.href).searchParams;
  const [projectId, setProject] = useState(params.get('project') || 'home');
  const [draftId, setDraft] = useState(params.get('draft'));
  const [mounted, setMounted] = useState(true), [signedOut, setSignedOut] = useState(false);
  const [drafts, setDrafts] = useState([]), [evidence, setEvidence] = useState(''), [width, setWidth] = useState(390);
  const inspect = async () => setEvidence(JSON.stringify({ held: registry.list(projectId),
    stored: await repository.list(projectId), accepted: await repository.listAccepted(projectId) }, null, 2));
  return <main style={{ width, maxWidth: '100%', boxSizing: 'border-box' }}>
    <style>{'body{font:16px system-ui;margin:16px;background:#f8fafc;color:#172033}main{padding:12px;background:white}label{display:block;margin:12px 0}input,select{font:inherit;padding:10px;max-width:100%;box-sizing:border-box}input{display:block;width:100%}button{padding:12px;margin:4px;min-height:44px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}section{border-top:1px solid #cbd5e1;margin-top:16px;padding-top:16px}'}</style>
    <h1>Draft navigation verification</h1>
    <p>Synthetic local test of the actual React hook. This is not the Shopping interface.</p>
    <button onClick={() => setWidth(width === 390 ? 1200 : 390)}>Toggle content width</button>
    <button disabled={signedOut} onClick={() => { faults.saves = true; setEvidence('Storage writes will fail.'); }}>Fail saves</button>
    <button disabled={signedOut} onClick={() => { faults.saves = false; setEvidence('Storage writes allowed.'); }}>Allow saves</button>
    <button disabled={signedOut} onClick={() => { faults.acceptance = true; setEvidence('Next acceptance commits then loses confirmation.'); }}>Lose acceptance confirmation</button>
    <button onClick={() => setMounted(value => !value)}>{mounted ? 'Leave editor' : 'Return to editor'}</button>
    <button disabled={signedOut} onClick={() => { owner = ''; registry.close(); journal.close(); setSignedOut(true); }}>End owner session</button>
    {!signedOut && <>
      <label>List <select aria-label="List" value={projectId} onChange={event => { setProject(event.target.value); setDraft(null); setDrafts([]); }}>
        <option value="home">Home</option><option value="trip">Trip</option>
      </select></label>
      <button onClick={() => { setDraft(registry.startNew(projectId)); setDrafts([]); }}>New draft</button>
      <button onClick={() => setDrafts(registry.list(projectId))}>Show retained drafts</button>
      {drafts.map(draft => <button key={draft.draftId} onClick={() => setDraft(draft.draftId)}>
        Open {draft.value.text || 'empty draft'} ({draft.phase})
      </button>)}
      <button onClick={inspect}>Inspect records</button>
    </>}
    {mounted && <Editor projectId={projectId} draftId={draftId}/>}
    <pre aria-label="Storage evidence">{evidence}</pre>
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
