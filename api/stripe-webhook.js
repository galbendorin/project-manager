import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

// Disable Vercel's default body parser so we get the raw body for signature verification
export const config = {
  api: { bodyParser: false },
};

// Helper: safely convert Stripe unix timestamp to ISO string
function safeTimestamp(val) {
  if (!val) return null;
  try {
    const ts = Number(val);
    if (isNaN(ts)) return null;
    return new Date(ts * 1000).toISOString();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Server billing configuration is incomplete.' });
  }

  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  console.log('Stripe event received:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object);
        break;
      }
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event.data.object);
        break;
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data.object);
        break;
      }
      case 'invoice.payment_failed': {
        await handlePaymentFailed(event.data.object);
        break;
      }
      default:
        console.log('Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// -------------------------------------------------------------------
// checkout.session.completed
// User just finished Stripe Checkout and subscribed
// -------------------------------------------------------------------
async function handleCheckoutCompleted(session) {
  const supabaseUserId = session.client_reference_id || session.metadata?.supabase_user_id;
  if (!supabaseUserId) {
    console.error('No supabase user ID found in checkout session');
    return;
  }

  // Retrieve the subscription to get period details
  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  // Safely convert period end to ISO string
  const periodEndISO = safeTimestamp(subscription.current_period_end);

  console.log('Updating billing profile after checkout completion.', {
    subscription_status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
  });

  const { error } = await supabase
    .from('user_profiles')
    .update({
      plan: 'pro',
      subscription_status: subscription.status,
      stripe_customer_id: session.customer,
      subscription_id: session.subscription,
      current_period_end: periodEndISO,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
    })
    .eq('id', supabaseUserId);

  if (error) {
    console.error('Failed to update user_profiles on checkout:', error);
    throw error;
  }

  console.log('Checkout completion synced to billing profile.');
}

// -------------------------------------------------------------------
// customer.subscription.updated
// Renewal, plan change, cancellation scheduled, etc.
// -------------------------------------------------------------------
async function handleSubscriptionUpdated(subscription) {
  // Find user by stripe customer ID
  const { data: users, error: lookupError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripe_customer_id', subscription.customer)
    .limit(1);

  if (lookupError || !users?.length) {
    console.error('Could not find user for customer:', subscription.customer, lookupError);
    return;
  }

  const userId = users[0].id;

  const updateData = {
    subscription_status: subscription.status,
    current_period_end: safeTimestamp(subscription.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    subscription_id: subscription.id,
  };

  // If subscription is active and not cancelling, ensure plan is pro
  if (subscription.status === 'active' && !subscription.cancel_at_period_end) {
    updateData.plan = 'pro';
  }

  // If cancellation is scheduled, keep plan as pro until period ends
  // (cancel_at_period_end = true means they'll lose access at current_period_end)

  const { error } = await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('id', userId);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  console.log('Subscription status updated.', {
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
  });
}

// -------------------------------------------------------------------
// customer.subscription.deleted
// Subscription fully ended — downgrade to Starter
// -------------------------------------------------------------------
async function handleSubscriptionDeleted(subscription) {
  const { data: users, error: lookupError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripe_customer_id', subscription.customer)
    .limit(1);

  if (lookupError || !users?.length) {
    console.error('Could not find user for customer:', subscription.customer, lookupError);
    return;
  }

  const userId = users[0].id;

  const { error } = await supabase
    .from('user_profiles')
    .update({
      plan: 'starter',
      subscription_status: 'canceled',
      cancel_at_period_end: false,
      // Keep stripe_customer_id and subscription_id for records
    })
    .eq('id', userId);

  if (error) {
    console.error('Failed to downgrade user:', error);
    throw error;
  }

  console.log('Subscription deleted; billing profile downgraded to Starter.');
}

// -------------------------------------------------------------------
// invoice.payment_failed
// Payment failed — flag it but don't immediately downgrade
// (Stripe retries payments automatically)
// -------------------------------------------------------------------
async function handlePaymentFailed(invoice) {
  const { data: users, error: lookupError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripe_customer_id', invoice.customer)
    .limit(1);

  if (lookupError || !users?.length) {
    console.error('Could not find user for failed payment:', invoice.customer);
    return;
  }

  const userId = users[0].id;

  const { error } = await supabase
    .from('user_profiles')
    .update({ subscription_status: 'past_due' })
    .eq('id', userId);

  if (error) {
    console.error('Failed to mark past_due:', error);
  }

  console.log('Payment failed; billing profile marked as past_due.');
}
