import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mapManualTodoRow } from './projectData/manualTodoUtils';
import {
  disablePushAlerts,
  enablePushAlerts,
  isPushNotificationsSupported,
  syncExistingPushSubscription,
} from '../utils/pushNotifications';

export function useShoppingListLiveUpdates({
  currentUserId,
  isOnline,
  selectedProject,
  loadTodos,
  persistOfflineState,
  setTodos,
  loadShoppingOfflineState,
  mergeTodosById,
  sortTodos,
  resolveSharedActorLabel,
}) {
  const [liveUpdateMessage, setLiveUpdateMessage] = useState('');
  const [pushSupported, setPushSupported] = useState(() => isPushNotificationsSupported());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState(() => (
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'default'
  ));
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const shoppingRealtimeChannelRef = useRef(null);

  const persistProjectTodos = useCallback((projectId, nextTodos) => {
    const cachedState = loadShoppingOfflineState(currentUserId);
    persistOfflineState({
      ...cachedState,
      selectedProjectId: projectId,
      todosByProject: {
        ...(cachedState.todosByProject || {}),
        [projectId]: nextTodos,
      },
      lastSyncedAt: new Date().toISOString(),
    });
  }, [currentUserId, loadShoppingOfflineState, persistOfflineState]);

  useEffect(() => {
    if (!liveUpdateMessage || typeof window === 'undefined') return undefined;
    const timeoutId = window.setTimeout(() => setLiveUpdateMessage(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [liveUpdateMessage]);

  useEffect(() => {
    if (!pushMessage || typeof window === 'undefined') return undefined;
    const timeoutId = window.setTimeout(() => setPushMessage(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pushMessage]);

  useEffect(() => {
    let active = true;

    if (!isPushNotificationsSupported()) {
      setPushSupported(false);
      setPushEnabled(false);
      return () => {
        active = false;
      };
    }

    setPushSupported(true);

    void syncExistingPushSubscription().then((result) => {
      if (!active || !result) return;
      setPushSupported(Boolean(result.supported));
      setPushEnabled(Boolean(result.enabled));
      setPushPermission(result.permission || window.Notification.permission);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProject?.id || typeof window === 'undefined') return undefined;

    const handleForegroundRefresh = () => {
      if (document.visibilityState === 'visible') {
        void loadTodos();
      }
    };

    const handleWindowFocus = () => {
      void loadTodos();
    };

    const handleWorkerMessage = (event) => {
      const message = event?.data;
      if (!message || (message.type !== 'shopping-list-updated' && message.type !== 'shopping-list-open')) {
        return;
      }

      const messageProjectId = String(message.projectId || '').trim();
      if (messageProjectId && messageProjectId !== selectedProject.id) return;
      void loadTodos();
    };

    document.addEventListener('visibilitychange', handleForegroundRefresh);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);
    navigator.serviceWorker?.addEventListener?.('message', handleWorkerMessage);

    return () => {
      document.removeEventListener('visibilitychange', handleForegroundRefresh);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
      navigator.serviceWorker?.removeEventListener?.('message', handleWorkerMessage);
    };
  }, [loadTodos, selectedProject?.id]);

  useEffect(() => {
    if (!selectedProject?.id || !isOnline) return undefined;

    const channel = supabase
      .channel(`shopping-list-live:${selectedProject.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'manual_todos',
          filter: `project_id=eq.${selectedProject.id}`,
        },
        (payload) => {
          const nextRow = payload?.new;
          if (!nextRow?.id) return;

          const incomingTodo = mapManualTodoRow(nextRow);
          const actorLabel = resolveSharedActorLabel(nextRow, selectedProject, currentUserId);
          const isFromSomeoneElse = Boolean(actorLabel);

          setTodos((previousItems) => {
            if (previousItems.some((item) => item._id === incomingTodo._id)) {
              return previousItems;
            }

            const nextTodos = mergeTodosById(previousItems, [incomingTodo]);
            persistProjectTodos(selectedProject.id, nextTodos);
            return nextTodos;
          });

          if (isFromSomeoneElse) {
            const message = `${actorLabel} added ${incomingTodo.title}.`;
            setLiveUpdateMessage(message);

            if (
              typeof window !== 'undefined'
              && typeof document !== 'undefined'
              && document.visibilityState === 'hidden'
              && !pushEnabled
              && 'Notification' in window
              && window.Notification?.permission === 'granted'
            ) {
              void navigator.serviceWorker?.ready
                ?.then((registration) => registration?.showNotification?.('Shopping List updated', {
                  body: message,
                  icon: '/pmworkspace-icon-192.png',
                  badge: '/pmworkspace-icon-192.png',
                  tag: `shopping-live:${selectedProject.id}`,
                  data: { url: '/shopping', projectId: selectedProject.id, kind: 'shopping-list' },
                }))
                .catch(() => null);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'manual_todos',
          filter: `project_id=eq.${selectedProject.id}`,
        },
        (payload) => {
          const nextRow = payload?.new;
          const previousRow = payload?.old;
          if (!nextRow?.id) return;

          const incomingTodo = mapManualTodoRow(nextRow);
          const actorLabel = resolveSharedActorLabel(nextRow, selectedProject, currentUserId);
          const isFromSomeoneElse = Boolean(actorLabel);
          const becameDone = previousRow?.status !== 'Done' && nextRow?.status === 'Done';

          setTodos((previousItems) => {
            const nextTodos = sortTodos(previousItems.map((item) => (
              item._id === incomingTodo._id ? incomingTodo : item
            )));
            persistProjectTodos(selectedProject.id, nextTodos);
            return nextTodos;
          });

          if (isFromSomeoneElse && becameDone) {
            setLiveUpdateMessage(`${actorLabel} bought ${incomingTodo.title}.`);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'manual_todos',
          filter: `project_id=eq.${selectedProject.id}`,
        },
        (payload) => {
          const previousRow = payload?.old;
          if (!previousRow?.id) return;

          const actorLabel = resolveSharedActorLabel(previousRow, selectedProject, currentUserId);
          const isFromSomeoneElse = Boolean(actorLabel);

          setTodos((previousItems) => {
            const nextTodos = previousItems.filter((item) => item._id !== previousRow.id);
            persistProjectTodos(selectedProject.id, nextTodos);
            return nextTodos;
          });

          if (isFromSomeoneElse) {
            const title = String(previousRow.title || 'an item').trim() || 'an item';
            setLiveUpdateMessage(`${actorLabel} removed ${title}.`);
          }
        }
      )
      .subscribe();

    shoppingRealtimeChannelRef.current = channel;

    return () => {
      if (shoppingRealtimeChannelRef.current) {
        void supabase.removeChannel(shoppingRealtimeChannelRef.current);
        shoppingRealtimeChannelRef.current = null;
      }
    };
  }, [
    currentUserId,
    isOnline,
    mergeTodosById,
    persistProjectTodos,
    pushEnabled,
    resolveSharedActorLabel,
    selectedProject,
    setTodos,
    sortTodos,
  ]);

  const handleEnablePushAlerts = useCallback(async () => {
    setPushBusy(true);
    const result = await enablePushAlerts();
    setPushSupported(Boolean(result.supported));
    setPushEnabled(Boolean(result.enabled));
    setPushPermission(result.permission || pushPermission);
    setPushMessage(result.message || 'Phone alert status updated.');
    setPushBusy(false);
  }, [pushPermission]);

  const handleDisablePushAlerts = useCallback(async () => {
    setPushBusy(true);
    const result = await disablePushAlerts();
    setPushSupported(Boolean(result.supported));
    setPushEnabled(Boolean(result.enabled));
    setPushPermission(result.permission || pushPermission);
    setPushMessage(result.message || 'Phone alert status updated.');
    setPushBusy(false);
  }, [pushPermission]);

  return {
    liveUpdateMessage,
    pushSupported,
    pushEnabled,
    pushPermission,
    pushBusy,
    pushMessage,
    handleEnablePushAlerts,
    handleDisablePushAlerts,
  };
}
