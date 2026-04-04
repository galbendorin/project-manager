import webpush from 'web-push';
import { getAdminSupabase } from './_auth.js';

const PUBLIC_KEY = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';
const CONTACT_EMAIL = process.env.WEB_PUSH_CONTACT_EMAIL || 'privacy@pmworkspace.com';
const adminSupabase = getAdminSupabase();

const toSubject = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'mailto:privacy@pmworkspace.com';
  if (normalized.startsWith('mailto:') || normalized.startsWith('https://')) return normalized;
  return `mailto:${normalized}`;
};

const configured = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (configured) {
  webpush.setVapidDetails(toSubject(CONTACT_EMAIL), PUBLIC_KEY, PRIVATE_KEY);
}

export const isWebPushConfigured = () => configured;
export const getWebPushPublicKey = () => PUBLIC_KEY;

export const deactivatePushSubscription = async (endpoint = '') => {
  if (!adminSupabase || !endpoint) return;

  await adminSupabase
    .from('push_subscriptions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('endpoint', endpoint);
};

export const sendWebPushNotification = async ({ subscription, payload }) => {
  if (!configured) {
    throw new Error('Web push is not configured.');
  }

  const response = await webpush.sendNotification(subscription, JSON.stringify(payload));
  return response;
};
