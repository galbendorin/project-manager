import Stripe from 'stripe';
import { applyApiCors, getAdminSupabase, requireAuthenticatedUser } from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';
import { CUSTOMER_PORTAL_RATE_LIMIT, buildCustomerPortalRateLimitKey } from './billingRateLimit.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pmworkspace.com';
const supabase = getAdminSupabase();

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

    const rateLimitResult = await checkRateLimit({
      key: buildCustomerPortalRateLimitKey(user.id, getClientIp(req)),
      ...CUSTOMER_PORTAL_RATE_LIMIT,
    });

    if (!rateLimitResult.ok) {
      return sendRateLimitResponse(
        res,
        rateLimitResult,
        'Too many billing portal requests. Please wait a moment and try again.',
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Failed to load billing profile:', profileError);
      return res.status(500).json({ error: 'Unable to load billing profile.' });
    }

    const stripeCustomerId = profile?.stripe_customer_id;
    if (!stripeCustomerId) {
      return res.status(400).json({ error: 'Billing is not linked to this account yet.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: APP_URL,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Customer portal error:', err);
    return res.status(500).json({ error: 'Unable to open billing portal right now.' });
  }
}
