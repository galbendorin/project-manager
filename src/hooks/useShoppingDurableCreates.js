import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createShoppingCreateJournal } from '../utils/shoppingCreateJournal';
import { createShoppingSessionTransport } from '../utils/shoppingSessionTransport';
import { createShoppingCreateWorkspace, projectShoppingCreates, shoppingCreateErrorMessage } from '../utils/shoppingCreateWorkspace';
import { shoppingCreateProgress } from '../utils/shoppingCreateOperation';
import { applyShoppingQueueToTodos, loadShoppingOfflineState, sortTodos } from '../utils/shoppingListViewState';
import { mapManualTodoRow } from './projectData/manualTodoUtils';

export function useShoppingDurableCreates({ currentUserId, isOnline, enabled, selectedProjectId,
  baseTodos, setTodos, persistOfflineState }) {
  const live = useRef(null);
  live.current = { currentUserId, isOnline, selectedProjectId, setTodos, persistOfflineState };
  const runtime = useRef(null);
  const [snapshot, setSnapshot] = useState({ owner: '', ready: false, records: [], errors: new Map(), refreshed: new Set(), busy: false });
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setSnapshot({ owner: currentUserId, ready: false, records: [], errors: new Map(), refreshed: new Set(), busy: false });
    if (!currentUserId) return undefined;
    let active = true;
    const abort = new AbortController();
    const owner = () => active && live.current.currentUserId === currentUserId ? currentUserId : '';
    const journal = createShoppingCreateJournal({ userId: currentUserId, getCurrentUserId: owner });
    const transport = createShoppingSessionTransport({ supabaseClient: supabase, userId: currentUserId,
      getCurrentUserId: owner, url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY, signal: abort.signal });
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`pmworkspace:shopping-creates:${currentUserId}`) : null;
    const workspace = createShoppingCreateWorkspace({ journal, transport, getCurrentUserId: owner,
      isOnline: () => active && live.current.isOnline,
      onChange: next => { if (owner()) setSnapshot({ owner: currentUserId, ready: true, ...next }); },
      broadcast: () => channel?.postMessage('changed'),
      onRefresh: (projectId, rows) => {
        if (!owner()) return;
        const cached = loadShoppingOfflineState(currentUserId);
        const nextTodos = applyShoppingQueueToTodos({ todos: rows.map(mapManualTodoRow), queue: cached.queue, projectId });
        live.current.persistOfflineState({ ...cached, todosByProject: { ...cached.todosByProject, [projectId]: nextTodos },
          lastSyncedAt: new Date().toISOString() });
        if (live.current.selectedProjectId === projectId) live.current.setTodos(sortTodos(nextTodos));
      },
    });
    runtime.current = workspace;
    const report = cause => { if (owner()) setError(shoppingCreateErrorMessage(cause)); };
    const wake = () => { void workspace.reload().then(() => workspace.sync()).catch(report); };
    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (session?.user?.id && session.user.id !== currentUserId)) {
        active = false; abort.abort(); workspace.close();
        if (runtime.current === workspace) runtime.current = null;
        setSnapshot({ owner: '', ready: false, records: [], errors: new Map(), refreshed: new Set(), busy: false });
      }
    }).data.subscription;
    if (channel) channel.onmessage = wake;
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    wake();
    return () => {
      active = false; abort.abort(); workspace.close(); subscription.unsubscribe(); channel?.close();
      window.removeEventListener('online', wake); window.removeEventListener('focus', wake);
      if (runtime.current === workspace) runtime.current = null;
    };
  }, [currentUserId]);

  const ownsSnapshot = snapshot.owner === currentUserId;
  const records = useMemo(() => ownsSnapshot ? snapshot.records : [], [ownsSnapshot, snapshot.records]);
  const ready = ownsSnapshot && snapshot.ready;
  const hasProjectRecords = records.some(record => record.projectId === selectedProjectId);
  const workspace = runtime.current;
  const isCurrent = useCallback(() => Boolean(workspace) && runtime.current === workspace
    && live.current.currentUserId === currentUserId, [workspace, currentUserId]);
  const todos = useMemo(() => sortTodos(projectShoppingCreates({ todos: baseTodos, records,
    projectId: selectedProjectId, refreshed: snapshot.refreshed })), [baseTodos, records, selectedProjectId, snapshot.refreshed]);
  const retry = useCallback(async () => {
    if (!isCurrent()) return;
    setError('');
    try { await workspace.sync(); } catch (cause) { if (isCurrent()) setError(shoppingCreateErrorMessage(cause)); }
  }, [isCurrent, workspace]);
  const refresh = useCallback(async () => {
    if ((!enabled && !hasProjectRecords) || !selectedProjectId || !isOnline || !ready || !isCurrent()) return;
    try { await workspace.refresh(selectedProjectId); } catch { /* Existing list loader reports its own refresh failure. */ }
  }, [enabled, hasProjectRecords, selectedProjectId, isOnline, ready, isCurrent, workspace]);
  const add = useCallback(async (items, options) => {
    if (!ready || !isCurrent() || !selectedProjectId) throw new Error('Shopping is still opening. Please try again.');
    return workspace.add(selectedProjectId, items, options);
  }, [ready, selectedProjectId, isCurrent, workspace]);
  const edit = useCallback(async (todo, patch) => {
    try {
      if (!isCurrent() || !ready) throw new Error('Shopping is still opening.');
      await workspace.edit(todo, patch);
      if (!isCurrent()) return { ok: false, cancelled: true };
      return { ok: true, queued: true };
    } catch (cause) {
      if (!isCurrent()) return { ok: false, cancelled: true };
      return { ok: false, message: shoppingCreateErrorMessage(cause) };
    }
  }, [ready, isCurrent, workspace]);
  const pendingRecords = records.filter(record => record.projectId === selectedProjectId
    && !['settled', 'local_cancelled'].includes(shoppingCreateProgress(record).status));
  const batches = ownsSnapshot ? (snapshot.batches || []).filter(batch => batch.projectId === selectedProjectId) : [];
  const showErrors = enabled || records.length || batches.length;
  return { enabled, ready, todos, sessionKey: workspace, records: pendingRecords,
    batches, add, edit, retry, refresh,
    busy: ownsSnapshot && snapshot.busy, error: showErrors ? error : '', errors: ownsSnapshot && showErrors ? snapshot.errors : new Map() };
}
