import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../../../src/contexts/AuthContext.jsx';
import { useShoppingDraftRuntime } from '../../../src/hooks/useShoppingDraftRuntime.js';
import { useShoppingDraftSession } from '../../../src/hooks/useShoppingDraftSession.js';
import { emit, faults } from './environment.js';
import { evidence } from './journal.js';

function Editor() {
  const runtime = useShoppingDraftRuntime();
  const draft = useShoppingDraftSession({ registry: runtime.registry, userId: runtime.scope?.userId, projectId: 'home' });
  return <section>
    <p role="status">{runtime.ready ? 'Runtime ready' : 'Runtime opening'}; {draft.phase}; {draft.saved ? 'Saved locally' : 'Not confirmed saved'}</p>
    <label>Draft <input aria-label="Draft" value={draft.value.text} disabled={!draft.canEdit}
      onChange={event => draft.edit({ text: event.target.value, items: event.target.value.trim() ? [{
        title: event.target.value, operationId: `item-${draft.draftId}`,
      }] : [] })}/></label>
    <button onClick={() => { void draft.retry().catch(() => {}); }}>Retry save</button>
    <pre aria-label="Draft identity">{JSON.stringify({ userId: runtime.scope?.userId, draftId: draft.draftId, error: draft.error || runtime.error }, null, 2)}</pre>
  </section>;
}
function Workspace() {
  const { user, signOut, shoppingDraftScope } = useAuth();
  useEffect(() => {
    evidence.lifecycle ||= [];
    evidence.lifecycle.push(`setup:${user?.id || 'none'}:${shoppingDraftScope ? 'capability' : 'none'}`);
    return () => { evidence.lifecycle.push('cleanup'); };
  }, []); // Intentionally records mount replay, not later auth changes.
  const [mounted, setMounted] = useState(true), [result, setResult] = useState('');
  const [previous, setPrevious] = useState(null);
  return <main><style>{'body{font:16px system-ui;margin:20px;color:#172033}main{max-width:800px}input{font:inherit;padding:12px;display:block;width:100%;box-sizing:border-box}button{padding:12px;margin:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{padding:16px 0;border-top:1px solid #cbd5e1;margin-top:16px}'}</style>
    <h1>Authenticated draft owner verification</h1><p>Actual AuthProvider and React StrictMode. Synthetic accounts and local IndexedDB only.</p>
    <p>Startup simulation: {navigator.onLine === false ? 'offline' : 'online'}</p>
    <p>Owner: {user?.id || 'signed out'}</p>
    <button onClick={() => { faults.saves = true; setResult('Saves will fail.'); }}>Fail saves</button>
    <button onClick={() => { faults.saves = false; setResult('Saves allowed.'); }}>Allow saves</button>
    <button onClick={() => setMounted(value => !value)}>{mounted ? 'Leave Shopping' : 'Return to Shopping'}</button>
    <button onClick={() => emit('TOKEN_REFRESHED', { id: user.id })}>Refresh same user</button>
    <button onClick={() => { setPrevious(shoppingDraftScope); emit('SIGNED_OUT', null); emit('SIGNED_IN', { id: 'owner-a' }); }}>Sign out and return to A</button>
    <button onClick={() => { setPrevious(shoppingDraftScope); emit('SIGNED_IN', { id: 'owner-b' }); }}>Switch to B</button>
    <button onClick={() => { void signOut(); }}>Sign out</button>
    <button onClick={() => { try { previous.acquire(); setResult('ERROR: stale scope acquired'); } catch (cause) { setResult(cause.code || cause.message); } }}>Try previous capability</button>
    <button onClick={() => setResult(JSON.stringify(evidence))}>Inspect writer lifetime</button>
    {mounted && user && <Editor/>}
    <pre aria-label="Result">{result}</pre>
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><AuthProvider><Workspace/></AuthProvider></React.StrictMode>);
