import Stripe from 'stripe';
import { applyApiCors, getAdminSupabase, requireAuthenticatedUser } from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pmworkspace.com';
const supabase = getAdminSupabase();

const PRICE_IDS = {
  monthly: 'price_1T9YcZGmvS2YZ5sJKGD1NtYT',
  annual: 'price_1T9YdXGmvS2YZ5sJTmCV5cNY',
};

const CHECKOUT_ALREADY_SUBSCRIBED_ERROR = 'Billing is already active on this account. Open the billing screen to manage your subscription instead of starting a new checkout.';
const CHECKOUT_MIGRATION_ERROR = 'Checkout protection is not configured yet. Apply the latest billing migration first.';

const isMissingCheckoutRpcError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42883'
    || message.includes('begin_checkout_session')
    || message.includes('complete_checkout_session')
    || message.includes('fail_checkout_session')
    || message.includes('billing_checkout_sessions');
};

const safeStripeTimestampToIso = (value) => {
  if (!value) return null;
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp * 1000).toISOString();
};

export const resolveCheckoutStartFailure = (result = {}) => {
  switch (String(result?.code || '')) {
    case 'already_subscribed':
      return { status: 409, error: CHECKOUT_ALREADY_SUBSCRIBED_ERROR };
    case 'invalid_request':
      return { status: 400, error: 'Unable to start checkout for that plan selection.' };
    default:
      return { status: 500, error: 'Unable to start checkout right now.' };
  }
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
    return res.status(500).json({ error: 'Server billing configuration is incomplete.' });
  }

  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const limitResult = await checkRateLimit({
      key: `checkout:${user.id}:${getClientIp(req)}`,
      max: 10,
      windowMs: 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, 'Too many checkout attempts. Please wait a moment and try again.');
    }

    const { plan } = req.body || {};
    if (!plan) {
      return res.status(400).json({ error: 'Missing required field: plan' });
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan. Use "monthly" or "annual".' });
    }

    const userEmail = user.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'Authenticated user email is missing.' });
    }

    const { data: checkoutStart, error: checkoutStartError } = await supabase.rpc('begin_checkout_session', {
      target_user_id: user.id,
      target_billing_interval: plan,
      target_price_id: priceId,
    });

    if (checkoutStartError) {
      if (isMissingCheckoutRpcError(checkoutStartError)) {
        return res.status(503).json({ error: CHECKOUT_MIGRATION_ERROR });
      }
      console.error('Failed to start protected checkout flow:', checkoutStartError);
      return res.status(500).json({ error: 'Unable to start checkout right now.' });
    }

    if (!checkoutStart?.ok) {
      const failure = resolveCheckoutStartFailure(checkoutStart);
      return res.status(failure.status).json({ error: failure.error });
    }

    const checkoutId = String(checkoutStart.checkout_id || '').trim();
    if (!checkoutId) {
      return res.status(500).json({ error: 'Unable to start checkout right now.' });
    }

    if (checkoutStart.session_url) {
      return res.status(200).json({ url: checkoutStart.session_url, reused: true });
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Failed to load billing profile:', profileError);
      return res.status(500).json({ error: 'Unable to load billing profile.' });
    }

    const stripeCustomerId = profile?.stripe_customer_id || null;

    // Build checkout session params
    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}?checkout=success`,
      cancel_url: `${APP_URL}?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      allow_promotion_codes: true,
    };

    // Reuse existing Stripe customer if we have one, otherwise create via email
    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    } else {
      sessionParams.customer_email = userEmail;
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams, {
        idempotencyKey: `checkout:${checkoutId}`,
      });
    } catch (stripeError) {
      await supabase.rpc('fail_checkout_session', {
        target_checkout_id: checkoutId,
        failure_reason: String(stripeError?.message || 'stripe-create-failed').slice(0, 500),
      }).catch((rpcError) => {
        console.error('Failed to mark checkout attempt as failed:', rpcError);
      });
      throw stripeError;
    }

    if (session?.id && session?.url) {
      const { error: completeCheckoutError } = await supabase.rpc('complete_checkout_session', {
        target_checkout_id: checkoutId,
        target_stripe_session_id: session.id,
        target_session_url: session.url,
        target_session_expires_at: safeStripeTimestampToIso(session.expires_at),
        target_stripe_customer_id: session.customer ? String(session.customer) : null,
      });

      if (completeCheckoutError) {
        console.error('Failed to persist checkout session metadata:', completeCheckoutError);
      }
    }

    if (!session?.url) {
      return res.status(500).json({ error: 'Unable to start checkout right now.' });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Unable to start checkout right now.' });
  }
}
