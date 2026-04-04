import { supabase } from '../lib/supabase';

const PUSH_PUBLIC_KEY_ENDPOINT = '/api/push-public-key';
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

const getSessionAccessToken = async () => {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || '';
};

const buildAuthHeaders = async () => {
  const token = await getSessionAccessToken();
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

export const isPushNotificationsSupported = () => (
  typeof window !== 'undefined'
  && 'Notification' in window
  && 'serviceWorker' in navigator
  && 'PushManager' in window
);

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

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager?.getSubscription?.();
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
  const registration = await getServiceWorkerRegistration();
  const subscription = await registration?.pushManager?.getSubscription?.();
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

export const notifyShoppingListSubscribers = async ({ projectId, itemTitles = [] }) => {
  const titles = (Array.isArray(itemTitles) ? itemTitles : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!projectId || titles.length === 0) return;

  const headers = await buildAuthHeaders();
  if (!headers.Authorization) return;

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
      }),
    });
  } catch {
    // Keep shopping interactions fast even if push delivery is unavailable.
  }
};
