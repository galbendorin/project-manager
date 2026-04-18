import test from 'node:test';
import assert from 'node:assert/strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

const { resolveCheckoutStartFailure } = await import('../../api/create-checkout-session.js');
const { resolveProjectInviteRpcResponse } = await import('../../api/project-members-invite.js');
const { resolveAiAllowanceFailure } = await import('../../api/ai-generate.js');

test('resolveCheckoutStartFailure blocks duplicate subscription starts', () => {
  const result = resolveCheckoutStartFailure({ code: 'already_subscribed' });

  assert.deepEqual(result, {
    status: 409,
    error: 'Billing is already active on this account. Open the billing screen to manage your subscription instead of starting a new checkout.',
  });
});

test('resolveProjectInviteRpcResponse preserves successful invite deliveries', () => {
  const response = resolveProjectInviteRpcResponse({
    ok: true,
    delivery: 'existing-account',
  });

  assert.deepEqual(response, {
    status: 200,
    body: {
      ok: true,
      message: 'Access is ready for this email. If they create an account later, it will appear after sign-in.',
      delivery: 'existing-account',
    },
  });
});

test('resolveProjectInviteRpcResponse maps seat-cap failures to a conflict response', () => {
  const response = resolveProjectInviteRpcResponse({
    ok: false,
    code: 'seat_cap_exceeded',
    limit: 7,
  });

  assert.deepEqual(response, {
    status: 409,
    body: {
      error: 'This project supports up to 7 collaborators at once.',
    },
  });
});

test('resolveAiAllowanceFailure returns user-facing entitlement errors', () => {
  assert.deepEqual(resolveAiAllowanceFailure({ code: 'ai_not_included' }), {
    status: 403,
    error: 'Your current plan does not include AI access.',
  });

  assert.deepEqual(resolveAiAllowanceFailure({ code: 'platform_ai_disabled' }), {
    status: 403,
    error: 'Platform AI is not enabled for this account. Please configure your own API key in AI Settings.',
  });

  assert.deepEqual(resolveAiAllowanceFailure({ code: 'ai_quota_exceeded' }), {
    status: 403,
    error: "You've reached your AI report limit for this month. Upgrade for more reports.",
  });
});
