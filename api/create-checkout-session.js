import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pmworkspace.com';

const PRICE_IDS = {
  monthly: 'price_1T9YcZGmvS2YZ5sJKGD1NtYT',
  annual: 'price_1T9YdXGmvS2YZ5sJTmCV5cNY',
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, userEmail, plan, stripeCustomerId } = req.body;

    if (!userId || !userEmail || !plan) {
      return res.status(400).json({ error: 'Missing required fields: userId, userEmail, plan' });
    }

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan. Use "monthly" or "annual".' });
    }

    // Build checkout session params
    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}?checkout=success`,
      cancel_url: `${APP_URL}?checkout=cancelled`,
      client_reference_id: userId,
      metadata: { supabase_user_id: userId },
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
