import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const opening = { phase: 'opening', value: { text: '', items: [] }, canEdit: false, saved: false, error: null };

// Opt-in seam for R2c. The authenticated owner owns the registry ABOVE routes,
// closes it on auth replacement, and keeps its repository alive between views.
// No per-mount fallback: that would discard failed/uncertain RAM on navigation.
export function useShoppingDraftSession({ registry, userId, projectId, draftId = null }) {
  const scope = useMemo(() => ({ registry, userId, projectId, draftId }), [registry, userId, projectId, draftId]);
  const current = useRef(scope);
  current.current = scope;
  const runtime = useRef(null);
  const [published, setPublished] = useState(null);
  useEffect(() => {
    if (!registry || !userId || !projectId) return undefined;
    let live = true;
    let session;
    const publish = snapshot => { if (live && current.current === scope) setPublished({ scope, snapshot }); };
    try {
      session = registry.attach({ userId, projectId, draftId, onChange: publish });
      runtime.current = { scope, session };
      publish(session.snapshot());
    } catch (cause) {
      publish({ ...opening, phase: 'unavailable', error: cause?.code || 'JOURNAL_STORAGE_FAILED' });
    }
    return () => {
      live = false; session?.detach();
      if (runtime.current?.scope === scope) runtime.current = null;
    };
  }, [draftId, projectId, registry, scope, userId]);
  const invoke = useCallback((method, ...args) => {
    const attachment = runtime.current;
    const check = () => {
      if (current.current !== scope || runtime.current?.scope !== scope || runtime.current !== attachment) {
        throw Object.assign(new Error('Shopping session changed.'), { code: 'JOURNAL_OWNER_CHANGED' });
      }
    };
    check();
    const result = attachment.session[method](...args);
    // Storage continues in its original lineage after navigation; its old UI
    // caller must not apply a late completion to the newly selected editor.
    return result?.then ? result.then(value => { check(); return value; }, cause => { check(); throw cause; }) : result;
  }, [scope]);
  return { ...(published?.scope === scope ? published.snapshot : opening),
    edit: useCallback(value => invoke('edit', value), [invoke]),
    flush: useCallback(() => invoke('flush'), [invoke]),
    submit: useCallback(() => invoke('submit'), [invoke]),
    retry: useCallback(() => invoke('retry'), [invoke]),
  };
}
