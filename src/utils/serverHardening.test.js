import test from 'node:test';
import assert from 'node:assert/strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';

const { resolveCheckoutStartFailure } = await import('../../api/create-checkout-session.js');
const { resolveProjectInviteRpcResponse } = await import('../../api/project-members-invite.js');
const {
  PENDING_INVITE_ACCEPT_RATE_LIMIT,
  buildPendingInviteAcceptRateLimitKey,
  createPendingInviteAcceptHandler,
  hasVerifiedInviteEmail,
} = await import('../../api/project-members-accept-pending.js');
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

test('pending invite acceptance uses a strict user and IP scoped rate limit', () => {
  assert.equal(
    buildPendingInviteAcceptRateLimitKey('user-123', '203.0.113.10'),
    'project-invite-accept:user-123:203.0.113.10',
  );
  assert.deepEqual(PENDING_INVITE_ACCEPT_RATE_LIMIT, {
    max: 30,
    windowMs: 5 * 60_000,
    strictShared: true,
  });
});

test('hasVerifiedInviteEmail requires both an email address and email_confirmed_at', () => {
  assert.equal(hasVerifiedInviteEmail({ email: 'member@example.com', email_confirmed_at: null }), false);
  assert.equal(hasVerifiedInviteEmail({ email: 'member@example.com', email_confirmed_at: '' }), false);
  assert.equal(hasVerifiedInviteEmail({ email: '  ', email_confirmed_at: '2026-11-17T00:00:00Z' }), false);
  assert.equal(hasVerifiedInviteEmail({ email: 'member@example.com', email_confirmed_at: '2026-11-17T00:00:00Z' }), true);
});

test('createPendingInviteAcceptHandler blocks unverified emails with 403 before querying invites', async () => {
  let queriedDb = false;
  const handler = createPendingInviteAcceptHandler({
    supabase: {
      from() {
        queriedDb = true;
        throw new Error('Must not query DB for unverified user');
      },
    },
    applyCors: () => {},
    requireUser: async () => ({
      id: 'user-unverified',
      email: 'invited@example.com',
      email_confirmed_at: null,
    }),
    rateLimit: async () => ({ ok: true }),
  });

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await handler({ method: 'POST', headers: {} }, res);

  assert.equal(queriedDb, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    ok: false,
    code: 'email_not_verified',
    error: 'Verify your account email before accepting pending project invitations.',
  });
});

test('createPendingInviteAcceptHandler allows verified users to check pending invites', async () => {
  let lookedUpEmail = null;
  const handler = createPendingInviteAcceptHandler({
    supabase: {
      from(table) {
        assert.equal(table, 'project_member_invites');
        return {
          select() { return this; },
          eq(column, value) {
            if (column === 'member_email') lookedUpEmail = value;
            return this;
          },
          is() { return this; },
          then(resolve) {
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        };
      },
    },
    applyCors: () => {},
    requireUser: async () => ({
      id: 'user-verified',
      email: 'Invited@Example.com',
      email_confirmed_at: '2026-11-17T00:00:00Z',
    }),
    rateLimit: async () => ({ ok: true }),
  });

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await handler({ method: 'POST', headers: {} }, res);

  assert.equal(lookedUpEmail, 'invited@example.com');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, acceptedCount: 0, skippedCount: 0 });
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
