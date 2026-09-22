import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Opt-in consumer for the future transactional editor. The auth owner retains
// its runtime across route unmounts; this hook only acquires its capability.
export function useShoppingDraftRuntime() {
  const { shoppingDraftScope: scope = null } = useAuth();
  const active = useRef(scope);
  active.current = scope;
  const [published, setPublished] = useState(null);
  const acquire = useCallback(() => {
    if (active.current !== scope) {
      throw Object.assign(new Error('Shopping session changed.'), { code: 'JOURNAL_OWNER_CHANGED' });
    }
    try {
      const runtime = scope?.enabled ? scope.acquire() : null;
      if (active.current === scope) setPublished({ scope, runtime, error: '' });
    } catch (cause) {
      if (active.current === scope) setPublished({ scope, runtime: null, error: cause?.code || 'JOURNAL_STORAGE_FAILED' });
    }
  }, [scope]);
  useEffect(() => {
    active.current = scope;
    acquire();
    return () => { if (active.current === scope) active.current = null; };
  }, [acquire, scope]);
  const snapshot = published?.scope === scope ? published : null;
  return { scope, enabled: Boolean(scope?.enabled), ready: Boolean(snapshot?.runtime),
    registry: snapshot?.runtime?.registry || null, repository: snapshot?.runtime?.repository || null,
    legacyRecovery: snapshot?.runtime?.legacyRecovery || null,
    error: snapshot?.error || '', retry: acquire };
}
