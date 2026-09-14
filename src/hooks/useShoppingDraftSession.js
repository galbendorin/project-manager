import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShoppingDraftSession } from '../utils/shoppingDraftSession';

const opening = { phase: 'opening', value: { text: '', items: [] }, canEdit: false, saved: false, error: null };

// Opt-in seam for R2c. The caller owns the journal/repository and must keep its
// reference stable. This hook does not open/upgrade a DB or alter the live View.
export function useShoppingDraftSession({ repository, userId, projectId, draftId = null }) {
  const scope = useMemo(() => ({ repository, userId, projectId, draftId }), [repository, userId, projectId, draftId]);
  const current = useRef(scope);
  current.current = scope;
  const runtime = useRef(null);
  const [published, setPublished] = useState(null);
  useEffect(() => {
    if (!repository || !userId || !projectId) return undefined;
    let live = true;
    const session = createShoppingDraftSession({ repository, userId, projectId,
      getCurrentUserId: () => live && current.current === scope ? userId : '',
      onChange: snapshot => { if (live && current.current === scope) setPublished({ scope, snapshot }); },
    });
    runtime.current = { scope, session };
    void session.recover(draftId).catch(() => {});
    return () => {
      live = false; session.close();
      if (runtime.current?.session === session) runtime.current = null;
    };
  }, [draftId, projectId, repository, scope, userId]);
  const invoke = useCallback((method, ...args) => {
    if (current.current !== scope || runtime.current?.scope !== scope) {
      throw Object.assign(new Error('Shopping session changed.'), { code: 'JOURNAL_OWNER_CHANGED' });
    }
    return runtime.current.session[method](...args);
  }, [scope]);
  return { ...(published?.scope === scope ? published.snapshot : opening),
    edit: useCallback(value => invoke('edit', value), [invoke]),
    flush: useCallback(() => invoke('flush'), [invoke]),
    submit: useCallback(() => invoke('submit'), [invoke]),
    retry: useCallback(() => invoke('retry'), [invoke]),
  };
}
