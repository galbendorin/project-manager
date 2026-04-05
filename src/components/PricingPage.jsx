import { useState } from 'react';
import AuthenticatedFooter from './AuthenticatedFooter';
import { usePlan } from '../contexts/PlanContext';
import { markBillingSyncPending } from '../utils/billingSync';
import { supabase } from '../lib/supabase';

export default function PricingPage({ onClose }) {
  const [billingCycle, setBillingCycle] = useState('annual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { effectivePlan, isAdmin, simulatedPlan } = usePlan();

  const isCurrentlyPro = effectivePlan === 'pro' || effectivePlan === 'team';
  // Allow admin to test checkout when plan simulator is active
  const blockUpgrade = isCurrentlyPro || (isAdmin && !simulatedPlan);

  const handleUpgrade = async (plan) => {
    if (blockUpgrade) return;

    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('Your session has expired. Please sign in again and retry checkout.');
      }

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          plan,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Unable to start checkout right now.');
      }

      if (data.url) {
        markBillingSyncPending('checkout');
        window.location.href = data.url;
      }
    } catch (err) {
      setError(getCheckoutErrorMessage(err));
      console.error('Checkout fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const starterFeatures = [
    { text: '3 projects', included: true },
    { text: '30 tasks per project', included: true },
    { text: 'Schedule, Issues, Actions, Tracker', included: true },
    { text: 'Import & Export to Excel', included: true },
    { text: 'All other registers (Risks, RACI, etc.)', included: false },
    { text: 'AI Reports & Assistant', included: false },
    { text: 'Baseline snapshots', included: false },
  ];

  const proFeatures = [
    { text: 'Unlimited projects', included: true },
    { text: '500 tasks per project', included: true },
    { text: 'All tabs & registers', included: true },
    { text: 'Import & Export to Excel', included: true },
    { text: 'AI Reports (100/month)', included: true },
    { text: 'AI Assistant panel', included: true },
    { text: 'Baseline snapshots', included: true },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
          aria-label="Close"
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center pt-10 pb-6 px-8">
          <h2 className="text-3xl font-bold text-gray-900">
            Upgrade to Pro
          </h2>
          <p className="text-gray-500 mt-2 text-lg">
            Unlock the full power of PM Workspace
          </p>

          {/* Billing toggle */}
          <div className="mt-6 inline-flex items-center bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                billingCycle === 'annual'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Annual
              <span className="ml-1.5 text-xs font-semibold text-emerald-600">Save 30%</span>
            </button>
          </div>
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-2 gap-6 px-8 pb-10">
          {/* Starter */}
          <div className="border border-gray-200 rounded-xl p-6 flex flex-col">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Starter</h3>
              <div className="mt-3">
                <span className="text-4xl font-bold text-gray-900">£0</span>
                <span className="text-gray-500 ml-1">/month</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">Free forever</p>
            </div>

            <ul className="space-y-3 flex-grow">
              {starterFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  {f.included ? (
                    <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={f.included ? 'text-gray-700' : 'text-gray-400'}>{f.text}</span>
                </li>
              ))}
            </ul>

            <button
              disabled
              className="mt-6 w-full py-3 rounded-lg border border-gray-200 text-gray-400 font-medium text-sm cursor-not-allowed"
            >
              Current plan
            </button>
          </div>

          {/* Pro */}
          <div className="border-2 border-blue-600 rounded-xl p-6 flex flex-col relative overflow-hidden">
            {/* Popular badge */}
            <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
              POPULAR
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Pro</h3>
              <div className="mt-3">
                {billingCycle === 'monthly' ? (
                  <>
                    <span className="text-4xl font-bold text-gray-900">£7.99</span>
                    <span className="text-gray-500 ml-1">/month</span>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-gray-900">£67</span>
                    <span className="text-gray-500 ml-1">/year</span>
                    <p className="text-sm text-emerald-600 mt-1 font-medium">£5.58/month — save 30%</p>
                  </>
                )}
              </div>
            </div>

            <ul className="space-y-3 flex-grow">
              {proFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700">{f.text}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleUpgrade(billingCycle)}
              disabled={loading || blockUpgrade}
              className={`mt-6 w-full py-3 rounded-lg font-medium text-sm transition-all ${
                blockUpgrade
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-lg shadow-blue-600/25'
              }`}
            >
              {loading
                ? 'Redirecting to checkout...'
                : blockUpgrade
                  ? 'You\'re on Pro'
                  : `Upgrade to Pro — ${billingCycle === 'monthly' ? '£7.99/mo' : '£67/yr'}`
              }
            </button>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {!error && (
              <p className="mt-4 text-xs text-gray-500">
                You will be redirected to secure Stripe checkout to complete the upgrade.
              </p>
            )}
          </div>
        </div>

        {/* Footer note */}
        <AuthenticatedFooter
          compact
          note="Cancel anytime. Your Pro access continues until the end of your billing period."
        />
      </div>
    </div>
  );
}

function getCheckoutErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (!message) {
    return 'Unable to start checkout right now. Please try again in a moment.';
  }

  if (message.includes('Missing required fields') || message.includes('Invalid plan')) {
    return 'Checkout could not be prepared. Refresh the page and try again.';
  }

  if (
    message.includes('Authentication required') ||
    message.includes('expired') ||
    message.includes('Invalid or expired session')
  ) {
    return 'Your session has expired. Please sign in again and retry checkout.';
  }

  if (message.toLowerCase().includes('network')) {
    return 'Network error while connecting to Stripe. Check your connection and try again.';
  }

  return 'Unable to start checkout right now. Please try again in a moment.';
}
