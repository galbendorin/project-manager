import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStripeWebhookHandler,
  reconcileStripeWebhookEvent,
} from '../../api/stripe-webhook.js';
import { resolveRealPlan } from './planAccess.js';

function createFakeBillingFixture({
  initialProfile = {
    id: 'user-1',
    plan: 'pro',
    subscription_id: 'sub_1',
    subscription_status: 'active',
    stripe_customer_id: 'cus_1',
    current_period_end: '2026-12-15T00:00:00.000Z',
    cancel_at_period_end: false,
    billing_revision: 0,
  },
  subscriptions = {},
  onBeforeUpdate = null,
} = {}) {
  const state = {
    profile: { ...initialProfile },
    checkoutSessions: [],
    subscriptions: { ...subscriptions },
    retrieveCalls: 0,
  };

  const stripeClient = {
    webhooks: {
      constructEvent(rawBody, sig) {
        if (sig === 'bad_sig') {
          throw new Error('Invalid signature');
        }
        return JSON.parse(String(rawBody));
      },
    },
    subscriptions: {
      async retrieve(subscriptionId) {
        state.retrieveCalls += 1;
        const sub = state.subscriptions[subscriptionId];
        if (!sub) {
          const err = new Error(`No such subscription: ${subscriptionId}`);
          err.statusCode = 404;
          err.code = 'resource_missing';
          throw err;
        }
        return structuredClone(sub);
      },
    },
  };

  const supabaseClient = {
    from(table) {
      if (table === 'billing_checkout_sessions') {
        return {
          update(patch) {
            return {
              async eq(col, val) {
                state.checkoutSessions.push({ col, val, patch });
                return { error: null };
              },
            };
          },
        };
      }

      if (table !== 'user_profiles') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select() {
          return {
            eq(col, val) {
              return {
                async limit() {
                  if (state.profile && state.profile[col] === val) {
                    return { data: [{ ...state.profile }], error: null };
                  }
                  return { data: [], error: null };
                },
              };
            },
          };
        },
        update(patch) {
          const filters = {};
          const builder = {
            eq(col, val) {
              filters[col] = val;
              return builder;
            },
            is(col, val) {
              filters[col] = val;
              return builder;
            },
            async select() {
              if (onBeforeUpdate) {
                await onBeforeUpdate(state, filters, patch);
              }
              const matchesId = state.profile.id === filters.id;
              const matchesSub = Object.prototype.hasOwnProperty.call(filters, 'subscription_id')
                ? (state.profile.subscription_id ?? null) === filters.subscription_id
                : true;
              const matchesStatus = Object.prototype.hasOwnProperty.call(filters, 'subscription_status')
                ? (state.profile.subscription_status ?? null) === filters.subscription_status
                : true;
              const matchesRevision = Object.prototype.hasOwnProperty.call(filters, 'billing_revision')
                ? (state.profile.billing_revision ?? null) === filters.billing_revision
                : true;
              if (!matchesId || !matchesSub || !matchesStatus || !matchesRevision) {
                return { data: [], error: null };
              }
              state.profile = {
                ...state.profile,
                ...patch,
              };
              return { data: [{ ...state.profile }], error: null };
            },
          };
          return builder;
        },
      };
    },
  };

  return { state, stripeClient, supabaseClient };
}

test('scheduled cancellation keeps plan as pro and preserves item-level current_period_end from modern Stripe SDK payloads', async () => {
  const periodEndUnix = 1800000000;
  const expectedPeriodEndIso = new Date(periodEndUnix * 1000).toISOString();

  const { state, stripeClient, supabaseClient } = createFakeBillingFixture({
    subscriptions: {
      sub_1: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        cancel_at_period_end: true,
        items: {
          data: [
            {
              id: 'si_1',
              current_period_end: periodEndUnix,
            },
          ],
        },
        created: 1700000000,
      },
    },
  });

  await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true } },
    },
    stripeClient,
    supabaseClient,
  });

  assert.equal(state.profile.plan, 'pro');
  assert.equal(state.profile.subscription_status, 'active');
  assert.equal(state.profile.cancel_at_period_end, true);
  assert.equal(state.profile.current_period_end, expectedPeriodEndIso);
  assert.equal(resolveRealPlan({ profile: state.profile }), 'pro');
});

test('unpaid and paused suspend effective Pro access and restore Pro when subscription recovers to active', async () => {
  const { state, stripeClient, supabaseClient } = createFakeBillingFixture({
    subscriptions: {
      sub_1: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'unpaid',
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_1', current_period_end: 1800000000 }] },
        created: 1700000000,
      },
    },
  });

  // 1. Transition to unpaid -> stored plan stays 'pro', resolver returns 'starter'
  await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'unpaid' } },
    },
    stripeClient,
    supabaseClient,
  });
  assert.equal(state.profile.plan, 'pro');
  assert.equal(state.profile.subscription_status, 'unpaid');
  assert.equal(resolveRealPlan({ profile: state.profile }), 'starter');

  // 2. Transition to paused via customer.subscription.paused -> stored plan stays 'pro', resolver returns 'starter'
  state.subscriptions.sub_1.status = 'paused';
  await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.paused',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'paused' } },
    },
    stripeClient,
    supabaseClient,
  });
  assert.equal(state.profile.plan, 'pro');
  assert.equal(state.profile.subscription_status, 'paused');
  assert.equal(resolveRealPlan({ profile: state.profile }), 'starter');

  // 3. Resume / recover to active (even with cancel_at_period_end = true) -> Pro restored immediately
  state.subscriptions.sub_1.status = 'active';
  state.subscriptions.sub_1.cancel_at_period_end = true;
  await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.resumed',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active' } },
    },
    stripeClient,
    supabaseClient,
  });
  assert.equal(state.profile.plan, 'pro');
  assert.equal(state.profile.subscription_status, 'active');
  assert.equal(state.profile.cancel_at_period_end, true);
  assert.equal(resolveRealPlan({ profile: state.profile }), 'pro');
});

test('incomplete first payment and incomplete_expired preserve an active app trial until payment succeeds', async () => {
  const { state, stripeClient, supabaseClient } = createFakeBillingFixture({
    initialProfile: {
      id: 'user-trial',
      plan: 'trial',
      subscription_id: null,
      subscription_status: 'trialing',
      stripe_customer_id: 'cus_trial',
      trial_ends: '2099-01-01T00:00:00.000Z',
      current_period_end: null,
      cancel_at_period_end: false,
      billing_revision: 0,
    },
    subscriptions: {
      sub_incomplete: {
        id: 'sub_incomplete',
        customer: 'cus_trial',
        status: 'incomplete',
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_1', current_period_end: 1800000000 }] },
        created: 1700000000,
      },
    },
  });

  // 1. Initial subscription created as incomplete -> app trial is preserved
  await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_incomplete', customer: 'cus_trial', status: 'incomplete' } },
    },
    stripeClient,
    supabaseClient,
  });

  assert.equal(state.profile.plan, 'trial');
  assert.equal(state.profile.subscription_status, 'incomplete');
  assert.equal(
    resolveRealPlan({ profile: state.profile, now: new Date('2026-11-16T00:00:00.000Z') }),
    'trial'
  );

  // 2. If initial payment expires (incomplete_expired), active app trial is still preserved
  state.subscriptions.sub_incomplete.status = 'incomplete_expired';
  await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_incomplete', customer: 'cus_trial', status: 'incomplete_expired' } },
    },
    stripeClient,
    supabaseClient,
  });

  assert.equal(state.profile.plan, 'trial');
  assert.equal(state.profile.subscription_status, 'incomplete_expired');
  assert.equal(
    resolveRealPlan({ profile: state.profile, now: new Date('2026-11-16T00:00:00.000Z') }),
    'trial'
  );

  // 3. Once a subscription becomes active, profile upgrades to Pro
  state.subscriptions.sub_incomplete.status = 'active';
  await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_incomplete', customer: 'cus_trial', status: 'active' } },
    },
    stripeClient,
    supabaseClient,
  });

  assert.equal(state.profile.plan, 'pro');
  assert.equal(state.profile.subscription_status, 'active');
  assert.equal(
    resolveRealPlan({ profile: state.profile, now: new Date('2026-11-16T00:00:00.000Z') }),
    'pro'
  );
});

test('concurrent events for the SAME subscription guard on billing_revision and re-fetch fresh Stripe state on retry', async () => {
  let simulatedConcurrentRecovery = false;

  const { state, stripeClient, supabaseClient } = createFakeBillingFixture({
    initialProfile: {
      id: 'user-1',
      plan: 'pro',
      subscription_id: 'sub_1',
      subscription_status: 'past_due',
      stripe_customer_id: 'cus_1',
      current_period_end: '2026-12-15T00:00:00.000Z',
      cancel_at_period_end: false,
      billing_revision: 5,
    },
    subscriptions: {
      sub_1: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'unpaid',
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_1', current_period_end: 1800000000 }] },
        created: 1700000000,
      },
    },
    onBeforeUpdate: async (fixtureState, filters, patch) => {
      // Simulate an earlier 'unpaid' webhook attempting to write after a concurrent 'active' recovery
      // already updated the same subscription_id ('sub_1') and bumped billing_revision from 5 to 6.
      if (!simulatedConcurrentRecovery && patch.subscription_status === 'unpaid' && filters.billing_revision === 5) {
        simulatedConcurrentRecovery = true;
        fixtureState.subscriptions.sub_1.status = 'active';
        fixtureState.profile = {
          ...fixtureState.profile,
          plan: 'pro',
          subscription_id: 'sub_1',
          subscription_status: 'active',
          billing_revision: 6,
        };
      }
    },
  });

  await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'unpaid' } },
    },
    stripeClient,
    supabaseClient,
  });

  assert.equal(simulatedConcurrentRecovery, true);
  assert.ok(state.retrieveCalls >= 2, 'Webhook must re-fetch live Stripe state on retry after concurrent conflict');
  assert.equal(state.profile.subscription_id, 'sub_1');
  assert.equal(state.profile.subscription_status, 'active', 'Older unpaid event must not overwrite newer active state');
  assert.equal(state.profile.plan, 'pro');
  assert.equal(resolveRealPlan({ profile: state.profile }), 'pro');
});

test('fallback profile lookup re-fetches Stripe state after reading billing_revision so a recovery between initial fetch and fallback read cannot be overwritten', async () => {
  let retrieveCount = 0;

  const { state, stripeClient, supabaseClient } = createFakeBillingFixture({
    initialProfile: {
      id: 'user-fallback',
      plan: 'trial',
      subscription_id: null,
      subscription_status: 'trialing',
      stripe_customer_id: 'cus_fallback',
      trial_ends: '2099-01-01T00:00:00.000Z',
      current_period_end: null,
      cancel_at_period_end: false,
      billing_revision: 0,
    },
    subscriptions: {
      sub_fallback: {
        id: 'sub_fallback',
        customer: 'cus_fallback',
        status: 'incomplete',
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_1', current_period_end: 1800000000 }] },
        created: 1700000000,
      },
    },
  });

  stripeClient.subscriptions.retrieve = async (subscriptionId) => {
    retrieveCount += 1;
    state.retrieveCalls += 1;
    if (retrieveCount === 1) {
      const staleSnapshot = structuredClone(state.subscriptions[subscriptionId]);
      // Concurrent recovery commits in both Stripe and DB before fallback profile lookup runs
      state.subscriptions[subscriptionId].status = 'active';
      state.profile = {
        ...state.profile,
        plan: 'pro',
        subscription_id: 'sub_fallback',
        subscription_status: 'active',
        billing_revision: 1,
      };
      return staleSnapshot;
    }
    return structuredClone(state.subscriptions[subscriptionId]);
  };

  // Event payload omits customer so the initial profile lookup before retrieve returns null,
  // forcing the fallback profile lookup after the first retrieve.
  await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_fallback', status: 'incomplete' } },
    },
    stripeClient,
    supabaseClient,
  });

  assert.ok(retrieveCount >= 2, 'Fallback profile discovery must re-fetch Stripe state after reading profile');
  assert.equal(state.profile.subscription_id, 'sub_fallback');
  assert.equal(state.profile.subscription_status, 'active');
  assert.equal(state.profile.plan, 'pro');
  assert.equal(resolveRealPlan({ profile: state.profile }), 'pro');
});

test('delayed out-of-order invoice.payment_failed or stale update does not overwrite a recovered active subscription', async () => {
  const { state, stripeClient, supabaseClient } = createFakeBillingFixture({
    subscriptions: {
      sub_1: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_1', current_period_end: 1800000000 }] },
        created: 1700000000,
      },
    },
  });

  await reconcileStripeWebhookEvent({
    event: {
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          subscription: 'sub_1',
        },
      },
    },
    stripeClient,
    supabaseClient,
  });

  assert.equal(state.profile.subscription_status, 'active');
  assert.equal(state.profile.plan, 'pro');
  assert.equal(resolveRealPlan({ profile: state.profile }), 'pro');
});

test('prior canceled subscription events do not overwrite a newer replacement subscription (including under concurrent race)', async () => {
  let simulatedConcurrentReplacement = false;

  const { state, stripeClient, supabaseClient } = createFakeBillingFixture({
    initialProfile: {
      id: 'user-1',
      plan: 'pro',
      subscription_id: 'sub_old',
      subscription_status: 'active',
      stripe_customer_id: 'cus_1',
      current_period_end: '2026-11-15T00:00:00.000Z',
      cancel_at_period_end: false,
      billing_revision: 1,
    },
    subscriptions: {
      sub_old: {
        id: 'sub_old',
        customer: 'cus_1',
        status: 'canceled',
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_old', current_period_end: 1750000000 }] },
        created: 1700000000,
      },
      sub_new: {
        id: 'sub_new',
        customer: 'cus_1',
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_new', current_period_end: 1850000000 }] },
        created: 1800000000,
      },
    },
    onBeforeUpdate: async (fixtureState, filters) => {
      if (!simulatedConcurrentReplacement && filters.subscription_id === 'sub_old') {
        simulatedConcurrentReplacement = true;
        fixtureState.profile = {
          ...fixtureState.profile,
          plan: 'pro',
          subscription_id: 'sub_new',
          subscription_status: 'active',
          billing_revision: 2,
        };
      }
    },
  });

  const result = await reconcileStripeWebhookEvent({
    event: {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_old',
          customer: 'cus_1',
          status: 'canceled',
        },
      },
    },
    stripeClient,
    supabaseClient,
  });

  assert.equal(result.skipped, true);
  assert.equal(state.profile.subscription_id, 'sub_new');
  assert.equal(state.profile.subscription_status, 'active');
  assert.equal(state.profile.plan, 'pro');
});

test('createStripeWebhookHandler verifies signature and routes supported events', async () => {
  const { state, stripeClient, supabaseClient } = createFakeBillingFixture({
    subscriptions: {
      sub_1: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'canceled',
        cancel_at_period_end: false,
        items: { data: [{ id: 'si_1', current_period_end: 1800000000 }] },
        created: 1700000000,
      },
    },
  });

  const handler = createStripeWebhookHandler({
    stripeClient,
    supabaseClient,
    webhookSecret: 'whsec_test',
    readRawBody: async (req) => Buffer.from(JSON.stringify(req.bodyPayload)),
  });

  let statusCode = 200;
  let jsonBody = null;
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(payload) {
      jsonBody = payload;
      return res;
    },
  };

  await handler(
    {
      method: 'POST',
      headers: { 'stripe-signature': 'good_sig' },
      bodyPayload: {
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled' } },
      },
    },
    res
  );

  assert.equal(statusCode, 200);
  assert.deepEqual(jsonBody, { received: true });
  assert.equal(state.profile.plan, 'starter');
  assert.equal(state.profile.subscription_status, 'canceled');
  assert.equal(resolveRealPlan({ profile: state.profile }), 'starter');
});
