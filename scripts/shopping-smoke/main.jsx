import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ShoppingListView from '../../src/components/ShoppingListView.jsx';
import { ownerId, service } from './environment.jsx';
import '../../src/styles/index.css';

function Fixture() {
  const [evidence, setEvidence] = useState('');
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setEvidence(JSON.stringify({ ...service.evidence, rows: service.snapshot() })), 100);
    return () => clearInterval(timer);
  }, []);
  return <main className="mx-auto max-w-7xl p-4">
    <aside className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
      <h1>Q11 isolated Shopping release smoke</h1>
      <p>Actual Shopping screen, hooks and IndexedDB. Synthetic auth and service only. No production requests.</p>
      <button type="button" onClick={() => { service.failNextCompletion(); setArmed(true); }}>Fail next check-off</button>
      <button type="button" onClick={() => service.keepCompletionFailing()}>Keep check-off failing</button>
      <p role="status">{armed ? 'Synthetic failure armed' : 'Synthetic service ready'}</p>
      <pre aria-label="Synthetic service evidence" className="overflow-auto text-xs">{evidence}</pre>
    </aside>
    <ShoppingListView currentUserId={ownerId}/>
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);
