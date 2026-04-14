import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';
import { deactivatePushSubscription, isWebPushConfigured, sendWebPushNotification } from './_webPush.js';

const supabase = getAdminSupabase();

const titleCaseFromEmail = (email = '') => String(email || '')
  .split('@')[0]
  .split(/[._-]+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const buildActorLabel = (user = {}) => {
  const fullName = String(user?.user_metadata?.full_name || '').trim();
  if (fullName) return fullName;
  return titleCaseFromEmail(user?.email) || 'Someone';
};

const formatShoppingBody = ({ actorLabel, itemTitles = [], eventType = 'added' }) => {
  const titles = itemTitles.slice(0, 3);
  const actionLabel = eventType === 'bought'
    ? 'bought'
    : eventType === 'deleted'
      ? 'removed'
      : 'added';
  if (titles.length === 0) {
    return `${actorLabel} updated the Shopping List.`;
  }

  if (titles.length === 1) {
    return `${actorLabel} ${actionLabel} ${titles[0]}.`;
  }

  if (itemTitles.length > titles.length) {
    return `${actorLabel} ${actionLabel} ${titles.join(', ')} and ${itemTitles.length - titles.length} more item${itemTitles.length - titles.length === 1 ? '' : 's'}.`;
  }

  return `${actorLabel} ${actionLabel} ${titles.join(', ')}.`;
};

const hasProjectAccess = async ({ userId, projectId, ownerId }) => {
  if (ownerId === userId) return true;

  const { data, error } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
};

export default async function handler(req, res) {
  applyApiCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Server authentication is not configured.' });
  }

  if (!isWebPushConfigured()) {
    return res.status(503).json({ error: 'Background alerts are not configured yet.' });
  }

  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const limitResult = await checkRateLimit({
      key: `shopping-push:${user.id}:${getClientIp(req)}`,
      max: 40,
      windowMs: 5 * 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, 'Too many shopping alerts were requested. Please wait a moment and try again.');
    }

    const projectId = String(req.body?.projectId || '').trim();
    const requestedEventType = String(req.body?.eventType || 'added').trim().toLowerCase();
    const eventType = ['added', 'bought', 'deleted'].includes(requestedEventType)
      ? requestedEventType
      : 'added';
    const itemTitles = (Array.isArray(req.body?.itemTitles) ? req.body.itemTitles : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!projectId || itemTitles.length === 0) {
      return res.status(400).json({ error: 'Missing projectId or grocery item titles.' });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, name')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error('Failed to load shopping project for alerts:', projectError);
      return res.status(500).json({ error: 'Unable to load the Shopping List project.' });
    }

    if (!project) {
      return res.status(404).json({ error: 'Shopping List project not found.' });
    }

    const allowed = await hasProjectAccess({
      userId: user.id,
      projectId,
      ownerId: project.user_id,
    });

    if (!allowed) {
      return res.status(403).json({ error: 'You do not have access to notify this Shopping List.' });
    }

    const { data: members, error: membersError } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId);

    if (membersError) {
      console.error('Failed to load Shopping List members for push:', membersError);
      return res.status(500).json({ error: 'Unable to load Shopping List members.' });
    }

    const recipientIds = [
      project.user_id,
      ...(members || []).map((member) => member?.user_id).filter(Boolean),
    ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index && value !== user.id);

    if (recipientIds.length === 0) {
      return res.status(200).json({ ok: true, sent: 0 });
    }

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, subscription')
      .in('user_id', recipientIds)
      .eq('is_active', true);

    if (subscriptionError) {
      console.error('Failed to load push subscriptions for Shopping List:', subscriptionError);
      return res.status(500).json({ error: 'Unable to load phone alert subscriptions.' });
    }

    const actorLabel = buildActorLabel(user);
    const payload = {
      title: 'Shopping List updated',
      body: formatShoppingBody({ actorLabel, itemTitles, eventType }),
      icon: '/pmworkspace-icon-192.png',
      badge: '/pmworkspace-icon-192.png',
      tag: `shopping:${projectId}`,
      data: {
        url: '/shopping',
        projectId,
        kind: 'shopping-list',
        eventType,
      },
    };

    let sent = 0;
    for (const row of subscriptions || []) {
      try {
        await sendWebPushNotification({
          subscription: row.subscription,
          payload,
        });
        sent += 1;
      } catch (error) {
        const statusCode = Number(error?.statusCode || error?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          await deactivatePushSubscription(row.endpoint);
          continue;
        }
        console.warn('Shopping push delivery failed:', error?.message || error);
      }
    }

    return res.status(200).json({ ok: true, sent });
  } catch (error) {
    console.error('Shopping push notify error:', error);
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
