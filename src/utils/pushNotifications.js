import { supabase } from '../lib/supabase';

const PUSH_PUBLIC_KEY_ENDPOINT = '/api/push-subscriptions';
const PUSH_SUBSCRIPTIONS_ENDPOINT = '/api/push-subscriptions';
const SHOPPING_NOTIFY_ENDPOINT = '/api/shopping-list-notify';

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const buildAuthHeaders = async (expectedUserId) => {
  const { data } = await supabase.auth.getSession();
  if (expectedUserId && data?.session?.user?.id !== expectedUserId) return {};
  const token = data?.session?.access_token || '';
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const urlBase64ToUint8Array = (base64String = '') => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = globalThis.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const getServiceWorkerRegistration = async () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  return navigator.serviceWorker.ready;
};

const getCurrentPushSubscription = async () => {
  const registration = await getServiceWorkerRegistration();
  return registration?.pushManager?.getSubscription?.() || null;
};

export const isPushNotificationsSupported = () => (
  typeof window !== 'undefined'
  && 'Notification' in window
  && 'serviceWorker' in navigator
  && 'PushManager' in window
);

export const requestAppNotificationPermission = async () => {
  if (!isPushNotificationsSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      message: 'This browser does not support reminders.',
    };
  }

  const permission = await window.Notification.requestPermission();
  return {
    supported: true,
    permission,
    message: permission === 'granted'
      ? 'Reminders are enabled on this device.'
      : permission === 'denied'
        ? 'Notifications are blocked. Allow them in browser settings to get reminders.'
        : 'Notification permission was not granted.',
  };
};

export const showAppNotification = async ({
  title = 'PM Workspace',
  body = 'You have a new reminder.',
  tag = 'pmworkspace-reminder',
  url = '/',
  kind = 'app-reminder',
} = {}) => {
  if (!isPushNotificationsSupported()) {
    return { ok: false, message: 'This browser does not support reminders.' };
  }

  if (window.Notification.permission !== 'granted') {
    return { ok: false, message: 'Enable reminders on this device first.' };
  }

  const options = {
    body,
    icon: '/pmworkspace-icon-192.png',
    badge: '/pmworkspace-icon-192.png',
    tag,
    data: { url, kind },
  };

  try {
    const registration = await getServiceWorkerRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return { ok: true, message: 'Reminder sent to this device.' };
    }
  } catch {
    // Fall through to the browser Notification constructor.
  }

  try {
    const notification = new window.Notification(title, options);
    notification.onclick = () => {
      window.focus();
      if (url) {
        const targetUrl = new URL(url, window.location.origin);
        const sameDestination = (
          window.location.pathname === targetUrl.pathname
          && window.location.search === targetUrl.search
        );
        if (!sameDestination) {
          window.location.assign(targetUrl.toString());
        }
      }
    };
    return { ok: true, message: 'Reminder sent to this device.' };
  } catch (error) {
    return { ok: false, message: error?.message || 'Unable to show the reminder.' };
  }
};

const sendServerPushTestAlert = async ({
  kind = 'shopping-list',
  unsupportedMessage = 'This browser does not support background alerts.',
  blockedMessage = 'Notifications are blocked. Allow them in browser settings, then try the test again.',
  unenabledMessage = 'Enable phone alerts first, then send a test alert.',
  missingSubscriptionMessage = 'No alert subscription was found on this device. Turn alerts on, then try the test again.',
  signInMessage = 'Sign in again before sending a test alert.',
  successFallback = 'Test alert sent to this device.',
  failureFallback = 'Unable to send a test alert right now.',
} = {}) => {
  if (!isPushNotificationsSupported()) {
    return {
      supported: false,
      enabled: false,
      permission: 'unsupported',
      message: unsupportedMessage,
    };
  }

  const permission = window.Notification.permission;
  if (permission !== 'granted') {
    return {
      supported: true,
      enabled: false,
      permission,
      message: permission === 'denied' ? blockedMessage : unenabledMessage,
    };
  }

  const subscription = await getCurrentPushSubscription();
  const endpoint = String(subscription?.endpoint || '').trim();
  if (!endpoint) {
    return {
      supported: true,
      enabled: false,
      permission,
      message: missingSubscriptionMessage,
    };
  }

  const headers = await buildAuthHeaders();
  if (!headers.Authorization) {
    return {
      supported: true,
      enabled: true,
      permission,
      message: signInMessage,
    };
  }

  const requestBody = kind === 'habit-reminder'
    ? { test: true, endpoint, kind: 'habit-reminder' }
    : { test: true, endpoint };

  try {
    const response = await fetch(SHOPPING_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(requestBody),
    });
    const data = await parseJsonResponse(response);
    const subscriptionMissing = response.status === 404 || response.status === 400;

    return {
      supported: true,
      enabled: response.ok ? true : !subscriptionMissing,
      permission,
      message: response.ok
        ? (data?.message || successFallback)
        : (data?.error || failureFallback),
    };
  } catch (error) {
    return {
      supported: true,
      enabled: true,
      permission,
      message: error?.message || failureFallback,
    };
  }
};

export const sendHabitReminderTestAlert = () => sendServerPushTestAlert({
  kind: 'habit-reminder',
  unsupportedMessage: 'This browser does not support background reminders.',
  unenabledMessage: 'Enable phone alerts first, then send a test reminder.',
  missingSubscriptionMessage: 'No alert subscription was found on this device. Enable phone alerts, then try the test again.',
  signInMessage: 'Sign in again before sending a test reminder.',
  successFallback: 'Test habit reminder sent to this device.',
  failureFallback: 'Unable to send a test reminder right now.',
});

export const syncExistingPushSubscription = async () => {
  if (!isPushNotificationsSupported()) {
    return {
      supported: false,
      enabled: false,
      permission: 'unsupported',
      message: 'This browser does not support background alerts.',
    };
  }

  const permission = window.Notification.permission;
  if (permission !== 'granted') {
    return {
      supported: true,
      enabled: false,
      permission,
      message: permission === 'denied'
        ? 'Notifications are blocked in this browser.'
        : 'Phone alerts are off on this device.',
    };
  }

  const subscription = await getCurrentPushSubscription();
  if (!subscription) {
    return {
      supported: true,
      enabled: false,
      permission,
      message: 'Phone alerts are off on this device.',
    };
  }

  const headers = await buildAuthHeaders();
  const response = await fetch(PUSH_SUBSCRIPTIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ subscription }),
  });
  const data = await parseJsonResponse(response);

  return {
    supported: true,
    enabled: response.ok,
    permission,
    message: response.ok
      ? (data?.message || 'Phone alerts are on for this device.')
      : (data?.error || 'Unable to finish phone-alert setup right now.'),
  };
};

export const enablePushAlerts = async () => {
  if (!isPushNotificationsSupported()) {
    return {
      supported: false,
      enabled: false,
      permission: 'unsupported',
      message: 'This browser does not support background alerts.',
    };
  }

  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      supported: true,
      enabled: false,
      permission,
      message: permission === 'denied'
        ? 'Notifications are blocked. Allow them in browser settings to get phone alerts.'
        : 'Notification permission was not granted.',
    };
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration?.pushManager) {
    return {
      supported: false,
      enabled: false,
      permission,
      message: 'Push alerts are not available yet on this device.',
    };
  }

  const configResponse = await fetch(PUSH_PUBLIC_KEY_ENDPOINT, { method: 'GET' });
  const config = await parseJsonResponse(configResponse);
  if (!configResponse.ok || !config?.publicKey) {
    return {
      supported: true,
      enabled: false,
      permission,
      message: config?.error || 'Background alerts are not configured on the server yet.',
    };
  }

  try {
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });

    const headers = await buildAuthHeaders();
    const response = await fetch(PUSH_SUBSCRIPTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ subscription }),
    });
    const data = await parseJsonResponse(response);

    return {
      supported: true,
      enabled: response.ok,
      permission,
      message: response.ok
        ? (data?.message || 'Phone alerts are on for this device.')
        : (data?.error || 'Unable to enable phone alerts right now.'),
    };
  } catch (error) {
    return {
      supported: true,
      enabled: false,
      permission,
      message: error?.message || 'Unable to enable phone alerts right now.',
    };
  }
};

export const disablePushAlerts = async () => {
  if (!isPushNotificationsSupported()) {
    return {
      supported: false,
      enabled: false,
      permission: 'unsupported',
      message: 'This browser does not support background alerts.',
    };
  }

  const permission = window.Notification.permission;
  const subscription = await getCurrentPushSubscription();
  const endpoint = subscription?.endpoint || '';
  const headers = await buildAuthHeaders();

  if (endpoint) {
    await fetch(PUSH_SUBSCRIPTIONS_ENDPOINT, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ endpoint }),
    }).catch(() => null);
  }

  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch {
      // Ignore unsubscribe failures and still report the local intent.
    }
  }

  return {
    supported: true,
    enabled: false,
    permission,
    message: 'Phone alerts are off on this device.',
  };
};

export const notifyShoppingListSubscribers = async ({
  projectId,
  itemTitles = [],
  eventType = 'added',
  expectedUserId,
  isCurrent = () => true,
}) => {
  const titles = (Array.isArray(itemTitles) ? itemTitles : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!projectId || titles.length === 0 || !isCurrent()) return;

  const headers = await buildAuthHeaders(expectedUserId);
  if (!headers.Authorization || !isCurrent()) return;

  try {
    await fetch(SHOPPING_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        projectId,
        itemTitles: titles,
        eventType,
      }),
    });
  } catch {
    // Keep shopping interactions fast even if push delivery is unavailable.
  }
};

export const sendShoppingTestAlert = () => sendServerPushTestAlert({
  kind: 'shopping-list',
});
