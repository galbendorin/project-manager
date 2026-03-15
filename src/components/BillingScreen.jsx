import { useState } from 'react';
import { usePlan } from '../contexts/PlanContext';
import { useAuth } from '../contexts/AuthContext';
import { markBillingSyncPending } from '../utils/billingSync';
import { TRIAL_OFFER_LABEL } from '../utils/trialOffer';

export default function BillingScreen({ onClose, onOpenPricing }) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  const { user } = useAuth();
  const { userProfile, effectivePlan, isAdmin } = usePlan();

  const stripeCustomerId = userProfile?.stripe_customer_id;
  const subscriptionStatus = userProfile?.subscription_status;
  const currentPeriodEnd = userProfile?.current_period_end;
  const trialEnds = userProfile?.trial_ends;
  const cancelAtPeriodEnd = userProfile?.cancel_at_period_end;

  const handleManageBilling = async () => {
    if (!stripeCustomerId) return;

    setPortalLoading(true);
    setPortalError('');
    try {
      const res = await fetch('/api/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeCustomerId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Unable to open the billing portal right now.');
      }

      if (data.url) {
        markBillingSyncPending('portal');
        window.location.href = data.url;
      }
    } catch (err) {
      setPortalError(getPortalErrorMessage(err));
      console.error('Portal fetch error:', err);
    } finally {
      setPortalLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getPlanLabel = () => {
    if (isAdmin) return 'Admin (Unlimited)';
    switch (effectivePlan) {
      case 'pro': return 'Pro';
      case 'trial': return 'Free Trial';
      case 'starter': return 'Starter (Free)';
      default: return effectivePlan;
    }
  };

  const getStatusBadge = () => {
    if (isAdmin) {
      return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Admin</span>;
    }
    if (cancelAtPeriodEnd) {
      return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Cancelling</span>;
    }
    switch (subscriptionStatus) {
      case 'active':
        return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Active</span>;
      case 'trialing':
        return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Trial</span>;
      case 'past_due':
        return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">Past Due</span>;
      case 'canceled':
        return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Cancelled</span>;
      default:
        return <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Free</span>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <h2 className="text-2xl font-bold text-gray-900">Billing & Plan</h2>
          <p className="text-gray-500 mt-1 text-sm">{user?.email}</p>
        </div>

        {/* Plan info card */}
        <div className="mx-8 p-5 rounded-xl bg-gray-50 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Current plan</p>
              <p className="text-xl font-bold text-gray-900">{getPlanLabel()}</p>
            </div>
            {getStatusBadge()}
          </div>

          {/* Renewal / expiry info */}
          {effectivePlan === 'pro' && currentPeriodEnd && !isAdmin && (
            <div className="pt-3 border-t border-gray-200">
              {cancelAtPeriodEnd ? (
                <p className="text-sm text-amber-600">
                  Pro access ends {formatDate(currentPeriodEnd)}. You won't be charged again.
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  Next renewal: {formatDate(currentPeriodEnd)}
                </p>
              )}
            </div>
          )}

          {effectivePlan === 'trial' && trialEnds && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-sm text-blue-600">
                You're on the {TRIAL_OFFER_LABEL}. Trial ends {formatDate(trialEnds)}. Upgrade to keep Pro features.
              </p>
            </div>
          )}

          {subscriptionStatus === 'past_due' && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-sm text-red-600">
                Your payment failed. Please update your payment method to keep Pro access.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-8 py-6 space-y-3">
          {portalError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {portalError}
            </div>
          )}

          {/* Show "Manage Billing" if they have a Stripe customer */}
          {stripeCustomerId && (
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className={`w-full py-3 rounded-lg font-medium text-sm transition-colors ${
                subscriptionStatus === 'past_due'
                  ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {portalLoading ? 'Opening billing portal...' : 'Manage billing & invoices'}
            </button>
          )}

          {/* Show upgrade button for non-pro users */}
          {!isCurrentlyProOrAdmin(effectivePlan, isAdmin) && (
            <button
              onClick={onOpenPricing}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25"
            >
              Upgrade to Pro
            </button>
          )}

          {/* Show resubscribe if cancelled */}
          {cancelAtPeriodEnd && (
            <p className="text-xs text-center text-gray-400">
              To resubscribe, click "Manage billing & invoices" above.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-8 py-4">
          <p className="text-xs text-gray-400 text-center">
            Payments are processed securely via Stripe. Cancel anytime from the billing portal.
          </p>
        </div>
      </div>
    </div>
  );
}

function isCurrentlyProOrAdmin(plan, isAdmin) {
  return isAdmin || plan === 'pro' || plan === 'team';
}

function getPortalErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (!message) {
    return 'Unable to open the billing portal right now. Please try again in a moment.';
  }

  if (message.includes('Missing stripeCustomerId')) {
    return 'Billing is not linked to this account yet. Try again after your first successful checkout.';
  }

  if (message.toLowerCase().includes('network')) {
    return 'Network error while connecting to Stripe. Check your connection and try again.';
  }

  return 'Unable to open the billing portal right now. Please try again in a moment.';
}
