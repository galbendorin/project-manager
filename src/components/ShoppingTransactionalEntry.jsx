import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShoppingDraftRuntime } from '../hooks/useShoppingDraftRuntime';
import { useShoppingDraftSession } from '../hooks/useShoppingDraftSession';
import { normalizeShoppingDraftItems, shoppingTextDraft } from '../utils/shoppingDraftInput';
import { formatShoppingAddSummary } from '../utils/shoppingListViewState';
import ShoppingListQuickAdd from './ShoppingListQuickAdd';
import ShoppingLegacyDraftReview from './ShoppingLegacyDraftReview';

export default function ShoppingTransactionalEntry({ entryRef, projectId, onAccepted, ...quickAddProps }) {
  const runtime = useShoppingDraftRuntime();
  const userId = runtime.scope?.userId;
  const scope = useMemo(() => ({ registry: runtime.registry, userId, projectId }), [runtime.registry, userId, projectId]);
  const active = useRef(scope); active.current = scope;
  const [selectedId, setSelectedId] = useState(null);
  const [choices, setChoices] = useState([]);
  const [message, setMessage] = useState('');
  const [pickerError, setPickerError] = useState('');
  const ticket = useRef(0);
  const draft = useShoppingDraftSession({ registry: runtime.registry, userId, projectId, draftId: selectedId });
  const currentDraft = useRef(draft); currentDraft.current = draft;
  const current = useCallback(() => active.current === scope && Boolean(runtime.registry) && Boolean(projectId), [scope, runtime.registry, projectId]);
  useEffect(() => {
    active.current = scope;
    return () => { if (active.current === scope) active.current = null; };
  }, [scope]);
  const choose = useCallback(id => { setSelectedId(id); setMessage(''); }, []);
  const listDrafts = useCallback(async () => {
    if (!current()) return;
    const request = ++ticket.current;
    const merge = stored => {
      const all = new Map(stored.map(head => [head.draftId, { ...head, phase: 'editing' }]));
      // Read RAM after the await: it may contain a newer failed save or an
      // acceptance which a delayed persisted listing has not yet observed.
      for (const held of runtime.registry.list(projectId)) all.set(held.draftId, held);
      return [...all.values()].filter(item => item.phase !== 'accepted' && (item.value?.text || item.value?.items?.length));
    };
    try {
      setChoices(merge([])); setPickerError('');
      const stored = await runtime.repository.list(projectId);
      if (current() && request === ticket.current) setChoices(merge(stored));
    } catch (cause) {
      if (cause?.code === 'JOURNAL_OWNER_CHANGED') return;
      if (current() && request === ticket.current) {
        try { setChoices(merge([])); }
        catch { return; } // Auth can revoke the registry before React updates.
        setPickerError('Saved drafts could not be loaded. Drafts open in this session are still available.');
      }
    }
  }, [current, runtime.registry, runtime.repository, projectId]);
  const newDraft = useCallback(() => {
    if (!current()) return;
    try { choose(runtime.registry.startNew(projectId)); }
    catch { setMessage('Unable to open another draft. Open an existing draft below and retry.'); }
  }, [current, choose, runtime.registry, projectId]);
  const wakeRecovery = useCallback(() => {
    // Acceptance is already durable. A failed wake must never restore this
    // input as a fresh submission or turn it into failedItems.
    try { void Promise.resolve(onAccepted()).catch(() => {}); } catch { /* Retry sync remains available. */ }
  }, [onAccepted]);
  useEffect(() => {
    if (draft.phase === 'accepted') {
      wakeRecovery(); newDraft();
      setMessage(formatShoppingAddSummary({ status: 'accepted' }));
    }
  }, [draft.phase, draft.draftId, wakeRecovery, newDraft]);
  const report = useCallback(result => {
    if (!current()) return { cancelled: true };
    setMessage(formatShoppingAddSummary(result));
    if (result.status === 'accepted') wakeRecovery();
    void listDrafts();
    return result;
  }, [current, listDrafts, wakeRecovery]);
  const submitDraft = draft.submit;
  const submit = useCallback(async event => {
    event?.preventDefault();
    try { return report(await submitDraft()); }
    catch (cause) {
      if (!current() || cause?.code === 'JOURNAL_OWNER_CHANGED') return { cancelled: true };
      setMessage('Unable to submit. Your draft is kept; retry before leaving the app.');
      return { status: 'not_submitted' };
    }
  }, [submitDraft, report, current]);
  const setText = useCallback(next => {
    if (!current()) return;
    const previous = currentDraft.current.value;
    const text = typeof next === 'function' ? next(previous.text) : next;
    try { currentDraft.current.edit(shoppingTextDraft(String(text), previous)); setMessage(''); }
    catch { setMessage('This draft is locked while its submission is checked. Retry, or start a separate draft.'); }
  }, [current]);
  const incoming = useCallback(async (items, reviewOnly = false) => {
    if (!current()) return { cancelled: true };
    let lease;
    try {
      const normalized = normalizeShoppingDraftItems(items);
      const id = runtime.registry.startNew(projectId);
      lease = runtime.registry.attach({ userId, projectId, draftId: id });
      lease.edit({ text: normalized.map(item => item.title).join(', '), items: normalized });
      choose(id); // The earlier typed draft stays in the saved/retained picker.
      if (reviewOnly) { void listDrafts(); return { status: 'review' }; }
      const result = await lease.submit();
      if (!current()) return { cancelled: true };
      // Only the selected session's accepted effect advances the editor.
      // Advancing here as well would allocate a second empty draft, or could
      // redirect a newer picker selection after a delayed completion.
      return report(result);
    } catch (cause) {
      if (!current() || cause?.code === 'JOURNAL_OWNER_CHANGED') return { cancelled: true };
      setMessage(`Unable to submit ${items.map(item => typeof item === 'string' ? item : item.title).join(', ')}. Check the details or open an existing draft and retry.`);
      return { status: 'not_submitted' };
    } finally { lease?.detach(); }
  }, [current, runtime.registry, projectId, userId, choose, listDrafts, report]);
  useEffect(() => {
    const entry = { add: items => incoming(items), review: text => incoming([text], true) };
    entryRef.current = entry;
    return () => { if (entryRef.current === entry) entryRef.current = null; };
  }, [entryRef, incoming]);
  useEffect(() => { void listDrafts(); }, [listDrafts]);
  const retry = async () => {
    if (!runtime.ready) { runtime.retry(); return; }
    try {
      const result = await draft.retry();
      if (result?.status) report(result);
      else if (current()) setMessage('Draft saved on this device. Tap Add when ready.');
    } catch { if (current()) setMessage('This draft still needs attention. Its details are kept.'); }
  };
  const status = !projectId ? 'Choose a shopping list to start.' : !runtime.ready ? 'Opening drafts…' : draft.phase === 'acceptance_unknown'
    ? 'Submission confirmation delayed. Retry checks the same submission safely.' : draft.phase === 'conflict'
      ? 'This draft changed elsewhere. Its details are kept for review.' : draft.phase === 'opening'
        ? 'Opening this draft…' : draft.saved ? 'Draft saved on this device.'
          : draft.canEdit && !draft.value.text && !draft.error ? 'Ready for groceries.'
            : 'Draft not yet saved. Keep the app open until it is saved.';
  return <>
    <ShoppingListQuickAdd {...quickAddProps} draftTitle={draft.value.text} setDraftTitle={setText}
      draftEditable={draft.canEdit} handleAddSubmit={submit}
      savingItems={!draft.canEdit || quickAddProps.savingItems} voiceSupported={quickAddProps.voiceSupported && runtime.ready}
      voiceMessage={message || quickAddProps.voiceMessage}/>
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
      <p role="status" className="text-sm text-slate-700">{status}</p>
      {(draft.error || runtime.error) && <p role="alert" className="mt-2 text-sm text-rose-700">Check or retry this draft before submitting it again.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="pm-subtle-button min-h-11 rounded-xl px-3 py-2 text-sm" disabled={!projectId} onClick={retry}>Retry draft</button>
        <button type="button" className="pm-subtle-button min-h-11 rounded-xl px-3 py-2 text-sm" disabled={!runtime.ready || !projectId} onClick={newDraft}>New draft</button>
        <button type="button" className="pm-subtle-button min-h-11 rounded-xl px-3 py-2 text-sm" disabled={!runtime.ready || !projectId} onClick={listDrafts}>Refresh saved drafts</button>
      </div>
      {pickerError && <p role="alert" className="mt-2 text-sm text-amber-800">{pickerError}</p>}
      {choices.length > 0 && <label className="mt-3 block text-sm text-slate-700">Saved drafts
        <select className="pm-input mt-1 w-full rounded-xl p-3" value={draft.draftId || ''} onChange={event => choose(event.target.value)}>
          {!choices.some(item => item.draftId === draft.draftId) && <option value={draft.draftId || ''}>Current draft</option>}
          {choices.map(item => <option key={item.draftId} value={item.draftId}>{item.value.text.slice(0, 90)}{item.phase === 'acceptance_unknown' ? ' — confirmation delayed' : ''}</option>)}
        </select>
      </label>}
    </div>
    {runtime.legacyRecovery && projectId && <ShoppingLegacyDraftReview key={`${userId}:${projectId}`}
      recovery={runtime.legacyRecovery} projectId={projectId} projectName={quickAddProps.selectedProject?.name || 'this shopping list'}
      onOpen={id => { choose(id); void listDrafts(); }} onAccepted={wakeRecovery}/>}
  </>;
}
