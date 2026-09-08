import React, { useState } from 'react';
import { shoppingCreateProgress } from '../utils/shoppingCreateOperation';

export default function ShoppingPendingAdds({ records, errors, busy, onRetry, onEdit }) {
  const [actionError, setActionError] = useState('');
  const visible = records.filter(record => record.desired.draft.cancel
    || shoppingCreateProgress(record).status === 'needs_review' || errors.has(record.operationId));
  const refreshErrors = [...errors.entries()].filter(([id]) => id.startsWith('refresh:') || id === 'storage');
  if (!visible.length && !refreshErrors.length) return null;
  return <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" aria-label="Pending grocery changes">
    <h3 className="font-semibold">Pending grocery changes</h3>
    {visible.map(record => {
      const cancelled = record.desired.draft.cancel;
      const review = shoppingCreateProgress(record).status === 'needs_review';
      return <div key={record.operationId} className="mt-3">
        <p className="font-medium">{cancelled ? `Cancellation pending: ${record.desired.draft.title}` : record.desired.draft.title}</p>
        <p className="mt-1">{errors.get(record.operationId) || (review
          ? 'Another change prevents this addition from being updated safely. Check the current list before changing it again.'
          : 'The item stays hidden while its cancellation is confirmed.')}</p>
        {cancelled ? <button type="button" className="mt-2 min-h-11 rounded-full border border-amber-300 bg-white px-4 font-semibold"
          onClick={async () => {
            const result = await onEdit({ _shoppingOperationId: record.operationId, _shoppingRevision: record.desired.revision }, { cancel: false });
            if (result.cancelled) return;
            setActionError(result.message || '');
          }}>Keep addition</button> : null}
      </div>;
    })}
    {refreshErrors.map(([id, message]) => <p key={id} className="mt-2">{message}</p>)}
    {actionError ? <p role="alert" className="mt-2">{actionError}</p> : null}
    <button type="button" disabled={busy} onClick={() => void onRetry()}
      className="mt-3 min-h-11 rounded-full border border-amber-300 bg-white px-4 font-semibold disabled:opacity-50">{busy ? 'Syncing…' : 'Retry sync'}</button>
  </section>;
}
