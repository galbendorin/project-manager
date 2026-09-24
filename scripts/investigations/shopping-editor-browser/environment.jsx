import { useCallback, useEffect, useState } from 'react';
export { supabase, emit, loadCachedOfflineUser, saveCachedOfflineUser, clearCachedOfflineUser,
  clearOfflineDataForUser } from '../shopping-draft-owner-browser/environment.js';

// Only upstream services are replaced. View, Actions, voice hook, editor,
// AuthProvider, journal, registry and operation workspace run their real code.
const projects = [
  { id: 'home', name: 'Home groceries', isOwned: true, ownerId: 'owner-a' },
  { id: 'weekend', name: 'Weekend groceries', isOwned: true, ownerId: 'owner-a' },
];
const noop = async () => {};
const bought = { _id: 'bought-fixture', projectId: 'home', title: 'Yoghurt', status: 'Done',
  quantityValue: 2, quantityUnit: 'pot', createdAt: '2026-09-16T10:00:00Z', completedAt: '2026-09-16T10:00:00Z' };
export const usePlan = () => ({ canCreateProject: true, limits: {}, refreshProjectCount: noop });
export const useOnlineStatus = () => {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const change = () => setOnline(faults.online);
    window.addEventListener('fixture-online', change);
    return () => window.removeEventListener('fixture-online', change);
  }, []);
  return online;
};
export const useShoppingListLiveUpdates = () => ({ pushSupported: false, pushEnabled: false,
  pushPermission: 'default', pushBusy: false, pushMessage: '', liveUpdateMessage: '',
  handleEnablePushAlerts: noop, handleDisablePushAlerts: noop, handleTestPushAlert: noop });
export const createShoppingSessionTransport = () => ({
  rpc: () => { evidence.syncAttempts++; throw new Error('Synthetic network unavailable; no request sent'); },
  readProject: () => { throw new Error('Fixture must not send network reads'); },
});
export function useShoppingListData({ currentUserId }) {
  const [selectedProjectId, setSelectedProjectId] = useState('home');
  const [todos, setTodos] = useState([bought]);
  const [todoError, setTodoError] = useState('');
  const loadTodos = useCallback(async () => { setTodos(selectedProjectId === 'home' ? [bought] : []); }, [selectedProjectId]);
  useEffect(() => { void loadTodos(); }, [loadTodos, currentUserId]);
  return { projects, selectedProjectId, setSelectedProjectId, selectedProject: projects.find(p => p.id === selectedProjectId),
    todos, setTodos, todoError, setTodoError, loadTodos, loadProjects: noop,
    loadingProjects: false, loadingTodos: false, offlineStateHydrated: true, projectError: '' };
}
export const faults = { saves: false, loseAcceptance: false, holdAcceptance: false, release: null, handoffTitle: '', online: false };
export const evidence = { acceptanceRequests: [], errors: [], syncAttempts: 0 };
export let recognition;
window.SpeechRecognition = class {
  constructor() { recognition = this; }
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() {}
};
export const speak = transcript => {
  const result = [{ transcript, confidence: 1 }]; result.isFinal = true;
  recognition?.onresult?.({ resultIndex: 0, results: [result] });
};
