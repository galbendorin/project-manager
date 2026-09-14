import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ShoppingPendingAdds from '../../../src/components/ShoppingPendingAdds.jsx';
import { createShoppingCreateJournal } from '../../../src/utils/shoppingCreateJournal.js';
import { createShoppingCreateWorkspace } from '../../../src/utils/shoppingCreateWorkspace.js';
import '../../../src/styles/index.css';

const userId = 'handoff-synthetic-owner', projectId = 'handoff-synthetic-project';
const journal = createShoppingCreateJournal({ userId, getCurrentUserId: () => userId });
let failWrites = false;
function App() {
  const [snapshot, setSnapshot] = useState({ records: [], batches: [], errors: new Map(), busy: false });
  const [width, setWidth] = useState(390), [message, setMessage] = useState('Rollout writer disabled. Synthetic local data only.');
  const [workspace] = useState(() => createShoppingCreateWorkspace({ journal: { ...journal, create: request => {
    if (failWrites && request.operationId.endsWith('-bread')) throw Object.assign(new Error('Injected storage failure'), { code: 'JOURNAL_STORAGE_FAILED' });
    return journal.create(request);
  } }, getCurrentUserId: () => userId, getSelectedProjectId: () => projectId, isOnline: () => false,
  inputBatches: { list: () => [], close() {} }, transport: {}, onChange: setSnapshot, onRefresh() {} }));
  useEffect(() => { void workspace.reload(); }, [workspace]);
  const seed = async () => {
    const writer = createShoppingCreateJournal({ userId, getCurrentUserId: () => userId, includeDrafts: true });
    try {
      const id = 'handoff-fixture';
      await writer.drafts.create({ projectId, draftId: id, value: { text: 'Milk, wholegrain bread', items: [
        { title: 'Milk', operationId: `${id}-milk`, quantityValue: 2, quantityUnit: 'carton', meta: { note: 'keep' } },
        { title: 'Wholegrain bread for the week', operationId: `${id}-bread`, quantityValue: 1, quantityUnit: 'loaf', meta: { note: 'keep' } },
      ] } });
      await writer.drafts.accept({ projectId, draftId: id, expectedVersion: 1 });
      failWrites = true; await workspace.sync(); setMessage('Partial handoff: one operation saved; one retained for retry.');
    } catch (error) { setMessage(error.code || error.message); }
    finally { writer.close(); }
  };
  return <main style={{ width, maxWidth: '100%', margin: 16 }}>
    <h1 className="text-xl font-bold">Saved grocery handoff verification</h1>
    <p className="my-3">{message}</p>
    <div className="flex flex-wrap gap-2">
      <button className="rounded border p-3" onClick={() => setWidth(390)}>Phone width</button>
      <button className="rounded border p-3" onClick={() => setWidth(1200)}>Desktop width</button>
      <button className="rounded border p-3" onClick={seed}>Seed partial handoff</button>
      <button className="rounded border p-3" onClick={() => { failWrites = false; setMessage('Storage available. Use Retry sync.'); }}>Allow storage</button>
    </div>
    <ShoppingPendingAdds records={snapshot.records} batches={snapshot.batches} errors={snapshot.errors}
      busy={snapshot.busy} onRetry={() => workspace.sync()} onEdit={async () => ({ cancelled: true })}/>
    <h2 className="mt-5 font-semibold">Operation journal</h2>
    <ul>{snapshot.records.map(record => <li key={record.operationId}>{record.desired.draft.title}: {record.desired.draft.quantityValue} {record.desired.draft.quantityUnit}</li>)}</ul>
    <p role="status">{snapshot.records.length} operation records; {snapshot.batches.length} pending batches; writer {journal.drafts ? 'enabled' : 'disabled'}</p>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
