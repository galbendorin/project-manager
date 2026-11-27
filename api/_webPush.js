import { createPublicKey } from 'node:crypto';
import { isIP } from 'node:net';
import webpush from 'web-push';
import { getAdminSupabase } from './_auth.js';

const PUBLIC_KEY = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';
const CONTACT_EMAIL = process.env.WEB_PUSH_CONTACT_EMAIL || 'privacy@pmworkspace.com';
const adminSupabase = getAdminSupabase();

const MAX_PUSH_ENDPOINT_LENGTH = 2048;
const ALLOWED_PUSH_EXACT_HOSTS = new Set([
  'web.push.apple.com',
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
]);
const ALLOWED_PUSH_SUBDOMAIN_SUFFIXES = [
  '.push.apple.com',
  '.fcm.googleapis.com',
  '.push.services.mozilla.com',
  '.autopush.prod.mozaws.net',
  '.autopush.stage.mozaws.net',
  '.notify.windows.com',
];
const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BASE64_RE = /^(?:[A-Za-z0-9+/]+={0,2})$/;
const BASE64URL_RE = /^(?:[A-Za-z0-9_-]+={0,2})$/;

const createPushValidationError = (message) => {
  const error = new Error(message);
  error.name = 'PushSubscriptionValidationError';
  error.code = 'invalid_push_subscription';
  // 410 ensures existing delivery cleanup deactivates tampered stored rows without outbound HTTP requests.
  error.statusCode = 410;
  return error;
};

const isAllowedPushHostname = (hostname = '') => {
  const normalized = String(hostname || '').toLowerCase();
  if (!normalized || normalized.endsWith('.') || normalized.includes(':') || normalized.includes('[')) {
    return false;
  }
  if (isIP(normalized) !== 0) {
    return false;
  }
  const labels = normalized.split('.');
  if (labels.length < 2 || labels.some((label) => !DNS_LABEL_RE.test(label))) {
    return false;
  }
  if (ALLOWED_PUSH_EXACT_HOSTS.has(normalized)) {
    return true;
  }
  return ALLOWED_PUSH_SUBDOMAIN_SUFFIXES.some(
    (suffix) => normalized.length > suffix.length && normalized.endsWith(suffix),
  );
};

export const validatePushEndpointUrl = (endpoint = '') => {
  if (typeof endpoint !== 'string') {
    throw createPushValidationError('Push subscription endpoint must be a string.');
  }
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw createPushValidationError('Missing push subscription endpoint.');
  }
  if (trimmed.length > MAX_PUSH_ENDPOINT_LENGTH) {
    throw createPushValidationError('Push subscription endpoint exceeds maximum allowed length.');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw createPushValidationError('Invalid push subscription endpoint URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw createPushValidationError('Push subscription endpoint must use HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw createPushValidationError('Push subscription endpoint must not contain credentials.');
  }
  if (parsed.port !== '' && parsed.port !== '443') {
    throw createPushValidationError('Push subscription endpoint must use the default HTTPS port.');
  }
  if (!isAllowedPushHostname(parsed.hostname)) {
    throw createPushValidationError('Push subscription endpoint host is not an allowlisted browser push service.');
  }

  return parsed.toString();
};

const validatePushKey = (rawKey, expectedBytes, keyLabel) => {
  if (typeof rawKey !== 'string') {
    throw createPushValidationError(`Push subscription key "${keyLabel}" must be a string.`);
  }
  const trimmed = rawKey.trim();
  if (!trimmed) {
    throw createPushValidationError(`Missing push subscription key "${keyLabel}".`);
  }

  const isBase64 = BASE64_RE.test(trimmed);
  const isBase64Url = BASE64URL_RE.test(trimmed);
  if (!isBase64 && !isBase64Url) {
    throw createPushValidationError(`Push subscription key "${keyLabel}" is not valid base64.`);
  }

  const standardBase64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const unpadded = standardBase64.replace(/=+$/, '');
  const remainder = unpadded.length % 4;
  if (remainder === 1) {
    throw createPushValidationError(`Push subscription key "${keyLabel}" has invalid base64 length.`);
  }
  const padded = remainder === 0 ? unpadded : `${unpadded}${'='.repeat(4 - remainder)}`;
  const decoded = Buffer.from(padded, 'base64');
  if (decoded.length !== expectedBytes) {
    throw createPushValidationError(
      `Push subscription key "${keyLabel}" must decode to ${expectedBytes} bytes.`,
    );
  }

  return {
    trimmed,
    decoded,
  };
};

const validateP256PublicKey = (rawKey) => {
  const { trimmed, decoded } = validatePushKey(rawKey, 65, 'p256dh');
  if (decoded[0] !== 0x04) {
    throw createPushValidationError('Push subscription key "p256dh" must be an uncompressed P-256 public key.');
  }
  try {
    createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: decoded.subarray(1, 33).toString('base64url'),
        y: decoded.subarray(33, 65).toString('base64url'),
      },
      format: 'jwk',
    });
  } catch {
    throw createPushValidationError('Push subscription key "p256dh" is not a valid P-256 public key.');
  }
  return trimmed;
};

export const validateAndNormalizePushSubscription = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createPushValidationError('Push subscription details must be an object.');
  }

  const endpoint = validatePushEndpointUrl(input.endpoint);
  const keys = input.keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    throw createPushValidationError('Push subscription keys are required.');
  }

  const p256dh = validateP256PublicKey(keys.p256dh);
  const auth = validatePushKey(keys.auth, 16, 'auth').trimmed;

  let expirationTime = null;
  if (input.expirationTime !== null && input.expirationTime !== undefined) {
    if (typeof input.expirationTime !== 'number' || !Number.isFinite(input.expirationTime) || input.expirationTime < 0) {
      throw createPushValidationError('Push subscription expirationTime must be null or a non-negative number.');
    }
    expirationTime = input.expirationTime;
  }

  return {
    endpoint,
    expirationTime,
    keys: {
      p256dh,
      auth,
    },
  };
};

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

  const normalizedSubscription = validateAndNormalizePushSubscription(subscription);
  const response = await webpush.sendNotification(normalizedSubscription, JSON.stringify(payload));
  return response;
};
