const BILLING_SYNC_SESSION_KEY = 'pmos.billing-sync-pending';

export const BILLING_SYNC_POLL_MS = 3000;
export const BILLING_SYNC_TIMEOUT_MS = 60000;

export function markBillingSyncPending(source = 'billing') {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(BILLING_SYNC_SESSION_KEY, source);
  } catch (error) {
    console.warn('Failed to persist billing sync state:', error);
  }
}

export function hasBillingSyncPending() {
  if (typeof window === 'undefined') return false;

  try {
    return Boolean(window.sessionStorage.getItem(BILLING_SYNC_SESSION_KEY));
  } catch (error) {
    console.warn('Failed to read billing sync state:', error);
    return false;
  }
}

export function clearBillingSyncPending() {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(BILLING_SYNC_SESSION_KEY);
  } catch (error) {
    console.warn('Failed to clear billing sync state:', error);
  }
}
