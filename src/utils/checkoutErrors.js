// @ts-check

/**
 * @param {{ status?: number | string, message?: string } | Error | string | null | undefined} error
 * @returns {string}
 */
export function getCheckoutErrorMessage(error) {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status || 0)
      : 0;
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();

  if (
    status === 409
    || normalized.includes('already_subscribed')
    || normalized.includes('billing is already active on this account')
  ) {
    return 'Your account already has a subscription or pending payment on file. Open Billing & Plan from your account menu to manage or update your payment method instead of starting a new checkout.';
  }

  if (status === 429 || normalized.includes('too many checkout attempts')) {
    return 'Too many checkout attempts. Please wait a moment and try again.';
  }

  if (status === 503 || normalized.includes('checkout protection is not configured')) {
    return 'Checkout is temporarily unavailable while billing setup completes. Please try again shortly.';
  }

  if (!message) {
    return 'Unable to start checkout right now. Please try again in a moment.';
  }

  if (message.includes('Missing required fields') || message.includes('Invalid plan')) {
    return 'Checkout could not be prepared. Refresh the page and try again.';
  }

  if (
    status === 401
    || message.includes('Authentication required')
    || message.includes('expired')
    || message.includes('Invalid or expired session')
  ) {
    return 'Your session has expired. Please sign in again and retry checkout.';
  }

  if (normalized.includes('network')) {
    return 'Network error while connecting to Stripe. Check your connection and try again.';
  }

  return 'Unable to start checkout right now. Please try again in a moment.';
}
