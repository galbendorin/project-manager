import { useState } from 'react';
import { usePlan } from '../contexts/PlanContext';
import { useAuth } from '../contexts/AuthContext';

const PRICE_IDS = {
  monthly: 'price_1T9YcZGmvS2YZ5sJKGD1NtYT',
  annual: 'price_1T9YdXGmvS2YZ5sJTmCV5cNY',
};

export default function PricingPage({ onClose }) {
  const [billingCycle, setBillingCycle] = useState('annual');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { userProfile, effectivePlan, isAdmin, simulatedPlan } = usePlan();

  const isCurrentlyPro = effectivePlan === 'pro' || effectivePlan === 'team';
  // Allow admin to test checkout when plan simulator is active
  const blockUpgrade = isCurrentlyPro || (isAdmin && !simulatedPlan);

  const handleUpgrade = async (plan) => {
    if (blockUpgrade) return;

    setLoading(true);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          userEmail: user?.email,
          plan,
          stripeCustomerId: userProfile?.stripe_customer_id || null,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Something went wrong. Please try again.');
        console.error('Checkout error:', data.error);
      }
    } catch (err) {
      alert('Failed to start checkout. Please try again.');
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
    { text: '10 projects', included: true },
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
            Unlock the full power of PM OS
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
          </div>
        </div>

        {/* Footer note */}
        <div className="border-t border-gray-100 px-8 py-4 text-center">
          <p className="text-xs text-gray-400">
            Cancel anytime. Your Pro access continues until the end of your billing period.
          </p>
        </div>
      </div>
    </div>
  );
}
