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

export default async function handler(req, res) {
  applyApiCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const limitResult = await checkRateLimit({
      key: `checkout:${user.id}:${getClientIp(req)}`,
      max: 10,
      windowMs: 60_000,
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

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
