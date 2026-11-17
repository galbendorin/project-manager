import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro';

const defaultStripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const defaultSupabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

// Disable Vercel's default body parser so we get the raw body for signature verification
export const config = {
  api: { bodyParser: false },
};

const ELIGIBLE_PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);
const RECOVERABLE_SUSPENDED_STATUSES = new Set(['unpaid', 'paused']);
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(['canceled', 'incomplete_expired']);
const ONGOING_OR_RECOVERABLE_STATUSES = new Set([
  ...ELIGIBLE_PRO_STATUSES,
  ...RECOVERABLE_SUSPENDED_STATUSES,
]);

const PROFILE_SELECT_FIELDS = [
  'id',
  'plan',
  'subscription_id',
  'subscription_status',
  'stripe_customer_id',
  'current_period_end',
  'cancel_at_period_end',
  'billing_revision',
].join(', ');

export function safeTimestamp(val) {
  if (!val) return null;
  try {
    const ts = Number(val);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return new Date(ts * 1000).toISOString();
  } catch {
    return null;
  }
}

export function extractSubscriptionPeriodEndIso(subscription, fallbackIso = null) {
  if (!subscription) return fallbackIso;

  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  let latestItemPeriodEnd = null;
  for (const item of items) {
    const ts = Number(item?.current_period_end);
    if (Number.isFinite(ts) && ts > 0 && (latestItemPeriodEnd === null || ts > latestItemPeriodEnd)) {
      latestItemPeriodEnd = ts;
    }
  }
  if (latestItemPeriodEnd !== null) {
    return safeTimestamp(latestItemPeriodEnd);
  }

  const direct = safeTimestamp(subscription.current_period_end);
  if (direct) return direct;

  const cancelAt = safeTimestamp(subscription.cancel_at);
  if (cancelAt) return cancelAt;

  return fallbackIso;
}

function extractStripeId(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.trim() || null;
  if (typeof val === 'object' && typeof val.id === 'string') return val.id.trim() || null;
  return null;
}

export function extractWebhookSubscriptionContext(event) {
  const type = String(event?.type || '');
  const obj = event?.data?.object || {};

  if (type === 'checkout.session.completed') {
    return {
      eventType: type,
      subscriptionId: extractStripeId(obj.subscription),
      customerId: extractStripeId(obj.customer),
      supabaseUserId: obj.client_reference_id || obj.metadata?.supabase_user_id || null,
      checkoutSessionId: extractStripeId(obj.id),
    };
  }

  if (type.startsWith('customer.subscription.')) {
    return {
      eventType: type,
      subscriptionId: extractStripeId(obj.id),
      customerId: extractStripeId(obj.customer),
      supabaseUserId: obj.metadata?.supabase_user_id || null,
      checkoutSessionId: null,
    };
  }

  if (type.startsWith('invoice.')) {
    const parentSubDetails = obj.parent?.subscription_details || obj.subscription_details || {};
    return {
      eventType: type,
      subscriptionId: extractStripeId(obj.subscription || parentSubDetails.subscription),
      customerId: extractStripeId(obj.customer),
      supabaseUserId: parentSubDetails.metadata?.supabase_user_id || null,
      checkoutSessionId: null,
    };
  }

  return null;
}

export function shouldIgnoreIncomingSubscription(incomingSub, existingSub, eventType = '') {
  if (!existingSub || !incomingSub) return false;
  if (existingSub.id === incomingSub.id) return false;

  const incomingStatus = String(incomingSub.status || '').toLowerCase();
  const existingStatus = String(existingSub.status || '').toLowerCase();
  const incomingCreated = Number(incomingSub.created || 0);
  const existingCreated = Number(existingSub.created || 0);

  // Never let a terminal subscription overwrite an ongoing or recoverable replacement subscription
  if (
    TERMINAL_SUBSCRIPTION_STATUSES.has(incomingStatus)
    && ONGOING_OR_RECOVERABLE_STATUSES.has(existingStatus)
  ) {
    return true;
  }

  // If the stored subscription was created more recently in Stripe and is not terminal, keep the newer subscription
  if (
    existingCreated > 0
    && incomingCreated > 0
    && existingCreated > incomingCreated
    && !TERMINAL_SUBSCRIPTION_STATUSES.has(existingStatus)
  ) {
    return true;
  }

  // If timestamps are unavailable/equal and the stored subscription is active/recoverable, only allow explicit new checkout/creation to replace it
  if (
    (!existingCreated || !incomingCreated || existingCreated === incomingCreated)
    && ONGOING_OR_RECOVERABLE_STATUSES.has(existingStatus)
    && !ONGOING_OR_RECOVERABLE_STATUSES.has(incomingStatus)
    && eventType !== 'checkout.session.completed'
  ) {
    return true;
  }

  return false;
}

export function buildAuthoritativeProfileUpdate(profile, liveSubscription, fallbackCustomerId = null) {
  const normalizedStatus = String(liveSubscription?.status || '').toLowerCase();
  const resolvedCustomerId = extractStripeId(liveSubscription?.customer)
    || fallbackCustomerId
    || profile?.stripe_customer_id
    || null;

  const currentPlan = String(profile?.plan || 'starter').toLowerCase();
  let nextPlan = currentPlan;

  if (currentPlan === 'team') {
    nextPlan = 'team';
  } else if (ELIGIBLE_PRO_STATUSES.has(normalizedStatus)) {
    nextPlan = 'pro';
  } else if (RECOVERABLE_SUSPENDED_STATUSES.has(normalizedStatus)) {
    // Keep plan as 'pro' during 'unpaid' and 'paused' so resolvers suspend Pro access
    // while non-eligible and automatically restore Pro when subscription_status becomes active again.
    nextPlan = 'pro';
  } else if (normalizedStatus === 'incomplete') {
    // An initial incomplete payment has not activated Pro yet; preserve an existing app trial
    // (or current plan) until the subscription becomes eligible.
    nextPlan = currentPlan === 'trial' ? 'trial' : (currentPlan || 'starter');
  } else if (TERMINAL_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    // Preserve an existing app trial if an initial incomplete subscription expired/cancelled
    // before ever promoting the profile to Pro; otherwise downgrade Pro to Starter.
    nextPlan = currentPlan === 'trial' ? 'trial' : 'starter';
  }

  const nextCancelAtPeriodEnd = TERMINAL_SUBSCRIPTION_STATUSES.has(normalizedStatus)
    ? false
    : Boolean(liveSubscription?.cancel_at_period_end);

  const fallbackPeriodEnd = TERMINAL_SUBSCRIPTION_STATUSES.has(normalizedStatus)
    ? null
    : (profile?.current_period_end || null);

  const nextUpdate = {
    plan: nextPlan,
    subscription_status: normalizedStatus,
    stripe_customer_id: resolvedCustomerId,
    subscription_id: liveSubscription.id,
    current_period_end: extractSubscriptionPeriodEndIso(liveSubscription, fallbackPeriodEnd),
    cancel_at_period_end: nextCancelAtPeriodEnd,
  };

  if (profile?.billing_revision !== undefined && profile?.billing_revision !== null) {
    nextUpdate.billing_revision = Number(profile.billing_revision) + 1;
  }

  return nextUpdate;
}

async function findTargetBillingProfile(supabaseClient, { subscriptionId, supabaseUserId, customerId }) {
  if (subscriptionId) {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select(PROFILE_SELECT_FIELDS)
      .eq('subscription_id', subscriptionId)
      .limit(1);
    if (error) throw error;
    if (data?.length) return data[0];
  }

  if (supabaseUserId) {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select(PROFILE_SELECT_FIELDS)
      .eq('id', supabaseUserId)
      .limit(1);
    if (error) throw error;
    if (data?.length) return data[0];
  }

  if (customerId) {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .select(PROFILE_SELECT_FIELDS)
      .eq('stripe_customer_id', customerId)
      .limit(1);
    if (error) throw error;
    if (data?.length) return data[0];
  }

  return null;
}

async function retrieveStripeSubscriptionSafe(stripeClient, subscriptionId) {
  if (!subscriptionId) return null;
  try {
    return await stripeClient.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    if (err?.statusCode === 404 || err?.code === 'resource_missing') {
      return null;
    }
    throw err;
  }
}

export async function reconcileStripeWebhookEvent({
  event,
  stripeClient = defaultStripe,
  supabaseClient = defaultSupabase,
}) {
  const context = extractWebhookSubscriptionContext(event);
  if (!context || !context.subscriptionId) {
    return { handled: false, reason: 'no_subscription_context' };
  }

  let updatedProfile = null;
  let lastResolvedCustomerId = context.customerId;
  let lastResolvedSupabaseUserId = context.supabaseUserId;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    // 1. Read the current profile snapshot FIRST so we capture its billing_revision
    //    before fetching live Stripe state.
    let profile = await findTargetBillingProfile(supabaseClient, {
      subscriptionId: context.subscriptionId,
      supabaseUserId: lastResolvedSupabaseUserId,
      customerId: lastResolvedCustomerId,
    });

    // 2. Fetch fresh authoritative subscription state from Stripe
    let liveSubscription = await stripeClient.subscriptions.retrieve(context.subscriptionId);
    const resolvedCustomerId = extractStripeId(liveSubscription?.customer) || context.customerId;
    const resolvedSupabaseUserId = context.supabaseUserId
      || liveSubscription?.metadata?.supabase_user_id
      || null;
    lastResolvedCustomerId = resolvedCustomerId;
    lastResolvedSupabaseUserId = resolvedSupabaseUserId;

    // 3. If the profile could only be discovered using identifiers from the Stripe response,
    //    read the profile now and then re-fetch Stripe state AFTER reading profile.billing_revision
    //    so a concurrent recovery between the initial Stripe fetch and the fallback profile read
    //    cannot leave us with a fresh revision and stale subscription data.
    if (!profile && (resolvedSupabaseUserId || resolvedCustomerId)) {
      profile = await findTargetBillingProfile(supabaseClient, {
        subscriptionId: liveSubscription.id,
        supabaseUserId: resolvedSupabaseUserId,
        customerId: resolvedCustomerId,
      });
      if (profile) {
        liveSubscription = await stripeClient.subscriptions.retrieve(context.subscriptionId);
      }
    }

    if (!profile) {
      console.error('Could not find billing profile for Stripe event:', {
        eventType: context.eventType,
        subscriptionId: liveSubscription.id,
        customerId: resolvedCustomerId,
      });
      return { handled: false, reason: 'profile_not_found' };
    }

    if (profile.subscription_id && profile.subscription_id !== liveSubscription.id) {
      const existingSub = await retrieveStripeSubscriptionSafe(stripeClient, profile.subscription_id);
      if (shouldIgnoreIncomingSubscription(liveSubscription, existingSub, context.eventType)) {
        return {
          handled: true,
          skipped: true,
          reason: 'superseded_by_replacement_subscription',
          activeSubscriptionId: profile.subscription_id,
        };
      }
    }

    const updateData = buildAuthoritativeProfileUpdate(profile, liveSubscription, resolvedCustomerId);

    let query = supabaseClient
      .from('user_profiles')
      .update(updateData)
      .eq('id', profile.id);

    if (profile.billing_revision !== undefined && profile.billing_revision !== null) {
      query = query.eq('billing_revision', profile.billing_revision);
    }

    if (profile.subscription_id) {
      query = query.eq('subscription_id', profile.subscription_id);
    } else {
      query = query.is('subscription_id', null);
    }

    if (profile.subscription_status) {
      query = query.eq('subscription_status', profile.subscription_status);
    } else {
      query = query.is('subscription_status', null);
    }

    const { data: updatedRows, error: updateError } = await query.select(PROFILE_SELECT_FIELDS);
    if (updateError) {
      console.error('Failed to update user_profiles from Stripe webhook:', updateError);
      throw updateError;
    }

    if (updatedRows?.length) {
      updatedProfile = updatedRows[0];
      break;
    }
  }

  if (!updatedProfile) {
    throw new Error('Concurrent billing profile update conflict; retry exhausted.');
  }

  if (context.checkoutSessionId) {
    const { error: checkoutSessionError } = await supabaseClient
      .from('billing_checkout_sessions')
      .update({
        status: 'completed',
        stripe_customer_id: lastResolvedCustomerId ? String(lastResolvedCustomerId) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_session_id', context.checkoutSessionId);

    if (checkoutSessionError) {
      console.warn('Failed to mark billing checkout session as completed:', checkoutSessionError.message || checkoutSessionError);
    }
  }

  return {
    handled: true,
    skipped: false,
    profile: updatedProfile,
  };
}

const HANDLED_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.payment_failed',
  'invoice.paid',
  'invoice.payment_succeeded',
]);

export function createStripeWebhookHandler({
  stripeClient = defaultStripe,
  supabaseClient = defaultSupabase,
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  readRawBody = buffer,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseClient || !stripeClient) {
      return res.status(500).json({ error: 'Server billing configuration is incomplete.' });
    }

    const sig = req.headers['stripe-signature'];
    const rawBody = await readRawBody(req);

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
      if (HANDLED_EVENT_TYPES.has(event.type)) {
        await reconcileStripeWebhookEvent({
          event,
          stripeClient,
          supabaseClient,
        });
      } else {
        console.log('Unhandled event type:', event.type);
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('Webhook processing error:', err);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  };
}

export default createStripeWebhookHandler();
