import { useEffect, useState } from 'react';

/**
 * Detects Stripe checkout result from URL params and shows a brief message.
 * Add to App.jsx: const checkoutStatus = useCheckoutStatus();
 * Then render <CheckoutToast status={checkoutStatus} /> somewhere in the JSX.
 */
export function useCheckoutStatus() {
  const [status, setStatus] = useState(null); // 'success' | 'cancelled' | null

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');

    if (checkout === 'success' || checkout === 'cancelled') {
      setStatus(checkout);
      // Clean the URL without reload
      const url = new URL(window.location);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url);

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => setStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  return status;
}

export function CheckoutToast({ status }) {
  if (!status) return null;

  const isSuccess = status === 'success';

  return (
    <div className={`fixed top-4 right-4 z-[60] px-5 py-3 rounded-lg shadow-lg text-sm font-medium transition-all animate-slide-in ${
      isSuccess
        ? 'bg-emerald-600 text-white'
        : 'bg-gray-700 text-white'
    }`}>
      {isSuccess
        ? '🎉 Welcome to Pro! Your account has been upgraded.'
        : 'Checkout was cancelled. No charges were made.'}
    </div>
  );
}
