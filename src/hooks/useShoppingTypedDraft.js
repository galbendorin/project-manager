import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createShoppingInputBatches } from '../utils/shoppingInputBatches';
import { splitTypedGroceries } from '../utils/shoppingListViewState';
import { readLocalJson, removeLocalJson, writeLocalJson } from '../utils/offlineState';

export function useShoppingTypedDraft({ userId, projectId, enabled }) {
  const owner = useRef(userId);
  owner.current = userId;
  const store = useMemo(() => createShoppingInputBatches({ userId, getCurrentUserId: () => owner.current }), [userId]);
  const legacyKey = `pmworkspace:shopping-draft:v1:${userId || 'anonymous'}`;
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const current = useRef(null);
  const scope = useMemo(() => ({ userId, projectId, store }), [userId, projectId, store]);
  const active = useRef(scope);
  active.current = scope;
  useEffect(() => {
    active.current = scope;
    return () => { if (active.current === scope) active.current = null; };
  }, [scope]);

  useEffect(() => {
    setError('');
    if (!enabled) {
      current.current = { text: readLocalJson(legacyKey, '') };
      setValue(current.current.text);
      return;
    }
    if (!userId || !projectId) { current.current = null; setValue(''); return; }
    try {
      let draft = store.readDraft(projectId);
      if (!draft) {
        const legacy = readLocalJson(legacyKey, '');
        draft = store.newDraft(projectId, typeof legacy === 'string' ? legacy : '', splitTypedGroceries(typeof legacy === 'string' ? legacy : ''));
        store.persistDraft(draft);
        // Only discard the legacy copy after the structured generation exists.
        removeLocalJson(legacyKey);
      }
      current.current = draft;
      setValue(draft.text);
    } catch {
      current.current = null;
      setValue(readLocalJson(legacyKey, ''));
      setError('Unable to open your saved draft. Please retry before adding groceries.');
    }
  }, [enabled, legacyKey, projectId, store, userId]);

  const set = useCallback(next => {
    if (active.current !== scope) return;
    const text = String(typeof next === 'function' ? next(current.current?.text || '') : next);
    if (!enabled) {
      current.current = { text }; setValue(text);
      if (text.trim()) writeLocalJson(legacyKey, text); else removeLocalJson(legacyKey);
      return;
    }
    const draft = store.newDraft(projectId, text, splitTypedGroceries(text));
    current.current = draft; setValue(text);
    try { store.persistDraft(draft); setError(''); }
    catch { setError('This draft could not be saved on this device. Keep this page open and retry.'); }
  }, [enabled, legacyKey, projectId, scope, store]);

  const prepare = useCallback(() => {
    if (active.current !== scope || !current.current?.generation) throw new Error('Shopping draft is still opening.');
    // Retry exactly the in-memory generation after failed persistence.
    store.persistDraft(current.current);
    return current.current;
  }, [scope, store]);
  const restoreFailed = useCallback(items => {
    if (active.current !== scope) return;
    const previous = current.current;
    const text = [previous?.text || '', ...items.map(item => item.title)].filter(Boolean).join('\n');
    const draft = store.newDraft(projectId, text, [...(previous?.items || []), ...items]);
    current.current = draft; setValue(text);
    try { store.persistDraft(draft); setError(''); }
    catch { setError('These groceries could not be saved on this device. Keep this page open and retry.'); }
  }, [projectId, scope, store]);
  const clearAccepted = useCallback(generation => {
    if (active.current !== scope || current.current?.generation !== generation) return;
    // Acceptance evidence already exists. Clearing React is cosmetic; a crash
    // before this call or its render reopens that generation as an empty draft.
    current.current = { ...current.current, text: '', items: [] };
    setValue('');
  }, [scope]);
  return { value, set, prepare, clearAccepted, restoreFailed, error };
}
