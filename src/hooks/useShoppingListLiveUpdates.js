import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mapManualTodoRow } from './projectData/manualTodoUtils';
import {
  disablePushAlerts,
  enablePushAlerts,
  isPushNotificationsSupported,
  sendShoppingTestAlert,
  syncExistingPushSubscription,
} from '../utils/pushNotifications';

const FOREGROUND_REFRESH_INTERVAL_MS = 60000;
const HIDDEN_REFRESH_DELAY_MS = 30000;

const canUseRealtimeUpdates = () => {
  if (typeof window === 'undefined') return false;
  const isSecurePage = (
    window.isSecureContext
    || window.location?.protocol === 'https:'
    || window.location?.hostname === 'localhost'
    || window.location?.hostname === '127.0.0.1'
  );

  return isSecurePage && typeof window.WebSocket === 'function';
};

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
  const lastForegroundRefreshAtRef = useRef(Date.now());
  const hiddenAtRef = useRef(0);

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

    void syncExistingPushSubscription()
      .then((result) => {
        if (!active || !result) return;
        setPushSupported(Boolean(result.supported));
        setPushEnabled(Boolean(result.enabled));
        setPushPermission(
          result.permission
            || (typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'default')
        );
      })
      .catch(() => {
        if (!active) return;
        setPushSupported(isPushNotificationsSupported());
        setPushEnabled(false);
        setPushPermission(
          typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'default'
        );
        setPushMessage('');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProject?.id || typeof window === 'undefined') return undefined;

    const loadTodosPreservingScroll = () => {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      void loadTodos().finally(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo(scrollX, scrollY);
        });
      });
    };

    const refreshIfStale = ({ force = false } = {}) => {
      const now = Date.now();
      if (!force && now - lastForegroundRefreshAtRef.current < FOREGROUND_REFRESH_INTERVAL_MS) {
        return;
      }

      lastForegroundRefreshAtRef.current = now;
      loadTodosPreservingScroll();
    };

    const handleForegroundRefresh = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = 0;

      if (!hiddenAt || Date.now() - hiddenAt < HIDDEN_REFRESH_DELAY_MS) {
        return;
      }

      refreshIfStale({ force: true });
    };

    const handleWindowFocus = () => {
      refreshIfStale();
    };

    const handleWorkerMessage = (event) => {
      const message = event?.data;
      if (!message || (message.type !== 'shopping-list-updated' && message.type !== 'shopping-list-open')) {
        return;
      }

      const messageProjectId = String(message.projectId || '').trim();
      if (messageProjectId && messageProjectId !== selectedProject.id) return;
      refreshIfStale({ force: true });
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
    if (!selectedProject?.id || !isOnline || !canUseRealtimeUpdates()) return undefined;

    try {
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
    } catch (error) {
      console.warn('Shopping list realtime unavailable on this device.', error);
      shoppingRealtimeChannelRef.current = null;
      return undefined;
    }

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

  const handleTestPushAlert = useCallback(async () => {
    setPushBusy(true);
    const result = await sendShoppingTestAlert();
    setPushSupported(Boolean(result.supported));
    setPushEnabled(Boolean(result.enabled));
    setPushPermission(result.permission || pushPermission);
    setPushMessage(result.message || 'Test alert requested.');
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
    handleTestPushAlert,
  };
}
