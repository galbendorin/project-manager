import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';
import {
  validateAndNormalizePushSubscription,
  validatePushEndpointUrl,
} from './_webPush.js';

const defaultSupabase = getAdminSupabase();

const isMissingPushTableError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42p01' || message.includes('push_subscriptions');
};

const isUniqueViolationError = (error) => String(error?.code || '') === '23505';

export const resolvePushSubscriptionWriteAction = ({ existingUserId, currentUserId }) => {
  const current = String(currentUserId || '').trim();
  const existing = String(existingUserId || '').trim();

  if (!current) {
    return { action: 'reject', reason: 'missing-current-user' };
  }

  if (!existing) {
    return { action: 'insert', reason: 'unclaimed-endpoint' };
  }

  if (existing === current) {
    return { action: 'update', reason: 'same-user' };
  }

  return { action: 'reject', reason: 'claimed-by-other-user' };
};

export const createPushSubscriptionsHandler = ({
  supabase = defaultSupabase,
  applyCors = applyApiCors,
  requireUser = requireAuthenticatedUser,
  rateLimit = checkRateLimit,
  getIp = getClientIp,
  sendRateLimit = sendRateLimitResponse,
  validateEndpoint = validatePushEndpointUrl,
  validateSubscription = validateAndNormalizePushSubscription,
} = {}) => async function handler(req, res) {
  const loadExistingPushSubscription = async (endpoint = '') => supabase
    .from('push_subscriptions')
    .select('id, user_id')
    .eq('endpoint', endpoint)
    .maybeSingle();

  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!['POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Server authentication is not configured.' });
  }

  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const limitResult = await rateLimit({
      key: `push-subscriptions:${user.id}:${getIp(req)}`,
      max: 20,
      windowMs: 5 * 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimit(res, limitResult, 'Too many notification changes. Please wait a moment and try again.');
    }

    if (req.method === 'DELETE') {
      let endpoint;
      try {
        endpoint = validateEndpoint(req.body?.endpoint);
      } catch (validationError) {
        return res.status(400).json({ error: validationError.message });
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('endpoint', endpoint)
        .eq('user_id', user.id);

      if (error) {
        if (isMissingPushTableError(error)) {
          return res.status(503).json({ error: 'Push subscriptions are not configured yet. Apply the latest push migration first.' });
        }
        console.error('Failed to disable push subscription:', error);
        return res.status(500).json({ error: 'Unable to disable phone alerts right now.' });
      }

      return res.status(200).json({ ok: true, message: 'Phone alerts are off on this device.' });
    }

    let normalizedSubscription;
    try {
      normalizedSubscription = validateSubscription(req.body?.subscription);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    const endpoint = normalizedSubscription.endpoint;
    const payload = {
      user_id: user.id,
      endpoint,
      subscription: normalizedSubscription,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
      is_active: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const saveForCurrentUser = async () => {
      const { data: existingRow, error: existingError } = await loadExistingPushSubscription(endpoint);

      if (existingError) {
        return { error: existingError };
      }

      const writeAction = resolvePushSubscriptionWriteAction({
        existingUserId: existingRow?.user_id,
        currentUserId: user.id,
      });

      if (writeAction.action === 'reject') {
        return {
          conflict: true,
          message: 'This device is already linked to another account. Turn off phone alerts there first, then try again.',
        };
      }

      if (writeAction.action === 'update') {
        const { error: updateError } = await supabase
          .from('push_subscriptions')
          .update(payload)
          .eq('endpoint', endpoint)
          .eq('user_id', user.id);

        return { error: updateError };
      }

      const { error: insertError } = await supabase
        .from('push_subscriptions')
        .insert(payload);

      if (!insertError) {
        return { error: null };
      }

      if (!isUniqueViolationError(insertError)) {
        return { error: insertError };
      }

      const { data: latestRow, error: latestError } = await loadExistingPushSubscription(endpoint);

      if (latestError) {
        return { error: latestError };
      }

      const latestWriteAction = resolvePushSubscriptionWriteAction({
        existingUserId: latestRow?.user_id,
        currentUserId: user.id,
      });

      if (latestWriteAction.action === 'update') {
        const { error: updateAfterRaceError } = await supabase
          .from('push_subscriptions')
          .update(payload)
          .eq('endpoint', endpoint)
          .eq('user_id', user.id);

        return { error: updateAfterRaceError };
      }

      if (latestWriteAction.action === 'reject') {
        return {
          conflict: true,
          message: 'This device is already linked to another account. Turn off phone alerts there first, then try again.',
        };
      }

      return { error: insertError };
    };

    const { error, conflict, message } = await saveForCurrentUser();

    if (error) {
      if (isMissingPushTableError(error)) {
        return res.status(503).json({ error: 'Push subscriptions are not configured yet. Apply the latest push migration first.' });
      }
      console.error('Failed to save push subscription:', error);
      return res.status(500).json({ error: 'Unable to enable phone alerts right now.' });
    }

    if (conflict) {
      return res.status(409).json({ error: message });
    }

    return res.status(200).json({ ok: true, message: 'Phone alerts are on for this device.' });
  } catch (error) {
    console.error('Push subscription error:', error);
    return res.status(500).json({ error: 'Unable to update phone alerts right now.' });
  }
};

export default createPushSubscriptionsHandler();
