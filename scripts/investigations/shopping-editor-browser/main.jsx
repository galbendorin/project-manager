import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../../../src/contexts/AuthContext.jsx';
import ShoppingListView from '../../../src/components/ShoppingListView.jsx';
import { createShoppingCreateJournal } from '../../../src/utils/shoppingCreateJournal.js';
import { createShoppingInputBatches } from '../../../src/utils/shoppingInputBatches.js';
import { faults, evidence, speak, emit } from './environment.jsx';
import '../../../src/styles/index.css';

window.addEventListener('unhandledrejection', event => { evidence.errors.push(String(event.reason?.message || event.reason)); });
function Fixture() {
  const { user, shoppingDraftScope } = useAuth();
  const [mounted, setMounted] = useState(true), [result, setResult] = useState('');
  const seedOlder = () => {
    const batches = createShoppingInputBatches({ userId: user.id, getCurrentUserId: () => user.id });
    const milk = { title: 'Legacy milk', operationId: crypto.randomUUID(), quantityValue: 2, quantityUnit: 'carton', meta: { note: 'preserve this' } };
    batches.persistDraft(batches.newDraft('home', 'Legacy milk', [milk]));
    const bread = { title: 'Already submitted bread', operationId: crypto.randomUUID() };
    const accepted = batches.newDraft('home', bread.title, [bread]); batches.persistDraft(accepted);
    batches.remove(batches.save('home', accepted.items, { draftGeneration: accepted.generation }));
    batches.persistDraft(batches.newDraft('home', 'Already submitted bread, New rice', [bread, { title: 'New rice', operationId: crypto.randomUUID() }]));
    localStorage.setItem(`pmworkspace:shopping-draft:v1:${user.id}`, JSON.stringify('Homemade soup,\nFresh rolls'));
    window.dispatchEvent(new Event('storage')); setResult('Synthetic older drafts seeded');
  };
  const inspect = async () => {
    const reader = createShoppingCreateJournal({ userId: user.id, getCurrentUserId: () => user.id });
    try {
      const drafts = shoppingDraftScope.acquire();
      setResult(JSON.stringify({ records: await reader.list(), home: await drafts.repository.listAccepted('home'),
        weekend: await drafts.repository.listAccepted('weekend'), ram: drafts.registry.list('home'), ...evidence }, null, 2));
    } finally { reader.close(); }
  };
  return <main className="mx-auto max-w-7xl p-4">
    <details className="mb-4 rounded-xl border p-3"><summary>Local verification controls</summary>
      <p>Actual Shopping screen; synthetic accounts, offline service indicator and local IndexedDB. No production data or requests.</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={seedOlder}>Seed older recovery examples</button>
        <button onClick={() => { faults.saves = true; setResult('Saves blocked'); }}>Fail saves</button>
        <button onClick={() => { faults.saves = false; setResult('Saves allowed'); }}>Allow saves</button>
        <button onClick={() => { faults.loseAcceptance = true; setResult('Next acceptance confirmation will be lost'); }}>Lose confirmation</button>
        <button onClick={() => { faults.holdAcceptance = true; setResult('Next acceptance confirmation held'); }}>Hold confirmation</button>
        <button onClick={() => { faults.holdAcceptance = false; faults.release?.(); setResult('Confirmation released'); }}>Release confirmation</button>
        <button onClick={() => setMounted(value => !value)}>{mounted ? 'Leave Shopping' : 'Return to Shopping'}</button>
        <button onClick={() => speak('Oranges, Pears')}>Speak groceries</button>
        <button onClick={() => speak('special homemade vegetable soup for tomorrow evening')}>Speak uncertain phrase</button>
        <button onClick={() => emit('SIGNED_IN', { id: user?.id === 'owner-a' ? 'owner-b' : 'owner-a' })}>Switch account</button>
        <button onClick={() => void inspect()}>Inspect local evidence</button>
      </div>
      <pre aria-label="Local evidence" className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{result}</pre>
    </details>
    {mounted && user && <ShoppingListView key={user.id} currentUserId={user.id}/>}
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><AuthProvider><Fixture/></AuthProvider></React.StrictMode>);
