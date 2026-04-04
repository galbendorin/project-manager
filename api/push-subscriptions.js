import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const supabase = getAdminSupabase();

const isMissingPushTableError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42p01' || message.includes('push_subscriptions');
};

export default async function handler(req, res) {
  applyApiCors(req, res);

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
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const limitResult = checkRateLimit({
      key: `push-subscriptions:${user.id}:${getClientIp(req)}`,
      max: 20,
      windowMs: 5 * 60_000,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, 'Too many notification changes. Please wait a moment and try again.');
    }

    if (req.method === 'DELETE') {
      const endpoint = String(req.body?.endpoint || '').trim();
      if (!endpoint) {
        return res.status(400).json({ error: 'Missing push subscription endpoint.' });
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

    const subscription = req.body?.subscription;
    const endpoint = String(subscription?.endpoint || '').trim();
    if (!endpoint || typeof subscription !== 'object') {
      return res.status(400).json({ error: 'Missing push subscription details.' });
    }

    const payload = {
      user_id: user.id,
      endpoint,
      subscription,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
      is_active: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(payload, { onConflict: 'endpoint' });

    if (error) {
      if (isMissingPushTableError(error)) {
        return res.status(503).json({ error: 'Push subscriptions are not configured yet. Apply the latest push migration first.' });
      }
      console.error('Failed to save push subscription:', error);
      return res.status(500).json({ error: 'Unable to enable phone alerts right now.' });
    }

    return res.status(200).json({ ok: true, message: 'Phone alerts are on for this device.' });
  } catch (error) {
    console.error('Push subscription error:', error);
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
