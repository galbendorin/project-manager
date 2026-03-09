import React from 'react';
import { usePlan } from '../contexts/PlanContext';

/**
 * Wraps tab content. If the user doesn't have access to this tab,
 * renders children behind a blur with an upgrade overlay.
 *
 * Usage:
 *   <BlurOverlay tabId="risks">
 *     <RegisterView ... />
 *   </BlurOverlay>
 */
const BlurOverlay = ({ tabId, children }) => {
  const { hasTabAccess, effectivePlan, isTrialActive, trialDaysLeft } = usePlan();

  if (hasTabAccess(tabId)) {
    return children;
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* Blurred content — renders real data but unreadable */}
      <div className="filter blur-[6px] pointer-events-none select-none h-full opacity-70">
        {children}
      </div>

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-xl p-8 max-w-sm mx-4 text-center">
          {/* Lock icon */}
          <div className="w-14 h-14 mx-auto mb-4 bg-indigo-100 rounded-full flex items-center justify-center">
            <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>

          <h3 className="text-lg font-bold text-slate-800 mb-2">
            Pro Feature
          </h3>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">
            This view is available on the <span className="font-semibold text-indigo-600">Pro plan</span>.
            Upgrade to unlock all registers, AI reports, baselines, and more.
          </p>

          <button
            onClick={() => {
              // TODO: Wire to Stripe checkout or pricing page
              window.open('/pricing', '_blank');
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 px-6 rounded-lg transition-colors shadow-sm"
          >
            Upgrade to Pro — £7.99/mo
          </button>

          <p className="text-[11px] text-slate-400 mt-3">
            Or £67/year (save 30%)
          </p>
        </div>
      </div>
    </div>
  );
};

export default BlurOverlay;
