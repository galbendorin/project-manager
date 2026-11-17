import test from 'node:test';
import assert from 'node:assert/strict';
import { getCheckoutErrorMessage } from './checkoutErrors.js';

test('getCheckoutErrorMessage guides users to Billing & Plan when checkout returns HTTP 409 already_subscribed', () => {
  const err = new Error('Billing is already active on this account. Open the billing screen to manage your subscription instead of starting a new checkout.');
  err.status = 409;

  assert.equal(
    getCheckoutErrorMessage(err),
    'Your account already has a subscription or pending payment on file. Open Billing & Plan from your account menu to manage or update your payment method instead of starting a new checkout.'
  );

  assert.equal(
    getCheckoutErrorMessage(new Error('already_subscribed')),
    'Your account already has a subscription or pending payment on file. Open Billing & Plan from your account menu to manage or update your payment method instead of starting a new checkout.'
  );
});

test('getCheckoutErrorMessage handles rate limit, expired session, network, and generic errors cleanly', () => {
  const rateLimitErr = new Error('Too many checkout attempts.');
  rateLimitErr.status = 429;
  assert.match(getCheckoutErrorMessage(rateLimitErr), /Too many checkout attempts/);

  const expiredErr = new Error('Invalid or expired session.');
  expiredErr.status = 401;
  assert.match(getCheckoutErrorMessage(expiredErr), /session has expired/i);

  assert.match(getCheckoutErrorMessage(new Error('Network request failed')), /Network error/i);
  assert.match(getCheckoutErrorMessage(new Error('Unexpected failure')), /Unable to start checkout right now/);
});
