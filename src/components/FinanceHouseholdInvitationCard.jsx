import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { hasPendingFinanceInvitation } from '../utils/financeAccess';

const getApiError = async (response) => {
  try {
    const payload = await response.json();
    return payload?.error || 'Unable to update this invitation right now.';
  } catch {
    return 'Unable to update this invitation right now.';
  }
};

export default function FinanceHouseholdInvitationCard({
  access,
  onAccessChanged,
  onOpenFinance,
}) {
  const [submittingAction, setSubmittingAction] = useState('');
  const [error, setError] = useState('');

  if (!hasPendingFinanceInvitation(access)) return null;

  const updateInvitation = async (action) => {
    setSubmittingAction(action);
    setError('');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || '';
      if (!token) throw new Error('Your session has expired. Please sign in again.');

      const response = await fetch('/api/finance-household-invitation', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationId: access.pendingInvitationId,
          action,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));

      await onAccessChanged?.();
      if (action === 'accept') onOpenFinance?.();
    } catch (nextError) {
      setError(nextError?.message || 'Unable to update this invitation right now.');
    } finally {
      setSubmittingAction('');
    }
  };

  const expiryLabel = access.pendingInvitationExpiresAt
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
      .format(new Date(access.pendingInvitationExpiresAt))
    : '';

  return (
    <section className="mt-5 rounded-[24px] border border-indigo-200 bg-indigo-50 px-4 py-4 shadow-sm sm:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-700">Household finance invitation</p>
          <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-slate-950">A family member shared their plan with you</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Accept to view and update the shared figures. Your own projects remain private.
            {expiryLabel ? ` Invitation expires ${expiryLabel}.` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={Boolean(submittingAction)}
            onClick={() => void updateInvitation('decline')}
            className="min-h-[44px] rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            {submittingAction === 'decline' ? 'Declining...' : 'Decline'}
          </button>
          <button
            type="button"
            disabled={Boolean(submittingAction)}
            onClick={() => void updateInvitation('accept')}
            className="pm-toolbar-primary min-h-[44px] rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {submittingAction === 'accept' ? 'Accepting...' : 'Accept & open'}
          </button>
        </div>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
    </section>
  );
}
