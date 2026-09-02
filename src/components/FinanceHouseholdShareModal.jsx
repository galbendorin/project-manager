import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const MEMBER_LIMIT = 5;

const readApiError = async (response, fallback) => {
  try {
    const payload = await response.json();
    return payload?.error || fallback;
  } catch {
    return fallback;
  }
};

const formatShortDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export default function FinanceHouseholdShareModal({ isOpen, onClose }) {
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const closeRef = useRef(null);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'active'),
    [members],
  );
  const pendingMembers = useMemo(
    () => members.filter((member) => member.status === 'pending'),
    [members],
  );
  const reservedSeats = activeMembers.length + pendingMembers.length;
  const seatsLeft = Math.max(0, MEMBER_LIMIT - reservedSeats);

  const loadMembers = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase
        .rpc('get_my_finance_household_members');
      if (loadError) throw loadError;
      setMembers(Array.isArray(data) ? data : []);
    } catch (nextError) {
      console.error('Failed to load finance household members:', nextError);
      setError('Unable to load family access right now.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setMembers([]);
      setError('');
      setMessage('');
      setLoading(false);
      setSubmitting(false);
      return;
    }
    void loadMembers();
  }, [isOpen, loadMembers]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement;
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const post = async (url, body, fallback) => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token || '';
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await readApiError(response, fallback));
    return response.json();
  };

  const invite = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter the family member’s account email.');
      return;
    }
    if (seatsLeft <= 0) {
      setError(`This household plan already has ${MEMBER_LIMIT} active or pending family members.`);
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const result = await post(
        '/api/finance-household-invite',
        { email: normalizedEmail },
        'Unable to send this invitation right now.',
      );
      setEmail('');
      setMessage(result?.delivery === 'existing_access'
        ? `${normalizedEmail} already has access.`
        : `Invitation created for ${normalizedEmail}. They must accept it after signing in.`);
      await loadMembers();
    } catch (nextError) {
      setError(nextError?.message || 'Unable to send this invitation right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (member) => {
    if (!member?.id) return;
    const label = member.status === 'active' ? 'Remove access for' : 'Cancel the invitation for';
    if (!window.confirm(`${label} ${member.member_email}?`)) return;

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await post(
        '/api/finance-household-remove',
        { membershipId: member.id },
        'Unable to remove this access right now.',
      );
      setMessage(member.status === 'active'
        ? `${member.member_email} no longer has access.`
        : `Invitation cancelled for ${member.member_email}.`);
      await loadMembers();
    } catch (nextError) {
      setError(nextError?.message || 'Unable to remove this access right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderMember = (member) => {
    const isActive = member.status === 'active';
    return (
      <div key={member.id} className={`rounded-2xl border px-4 py-3 ${isActive ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="break-all text-sm font-bold text-slate-900">{member.member_email}</p>
            <p className="mt-1 text-xs text-slate-500">
              {isActive
                ? `Editor · accepted ${formatShortDate(member.accepted_at)}`
                : `Pending · expires ${formatShortDate(member.expires_at)}`}
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void remove(member)}
            className="min-h-[40px] shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
          >
            {isActive ? 'Remove' : 'Cancel'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:px-4">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close family access" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-family-access-title"
        className="relative z-10 flex max-h-[calc(100dvh-12px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-slate-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[28px]"
      >
        <header className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--pm-accent)]">Private household</p>
              <h2 id="finance-family-access-title" className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-950">Family access</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Invite up to {MEMBER_LIMIT} people. They see this household plan only after accepting.</p>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} className="min-h-[40px] shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600">Close</button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            Editors can add and update planning figures and month check-ins. Only you can share access, change plan settings, delete historical records, or reset the household plan.
          </div>

          <form onSubmit={invite} className="rounded-2xl border border-slate-200 p-4">
            <label htmlFor="finance-family-email" className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Invite by account email</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="finance-family-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="family@example.com"
                autoComplete="email"
                disabled={submitting || seatsLeft <= 0}
                className="pm-input min-h-[44px] min-w-0 flex-1 rounded-xl px-3 text-[16px] sm:text-sm"
              />
              <button type="submit" disabled={submitting || seatsLeft <= 0} className="pm-toolbar-primary min-h-[44px] rounded-xl px-4 text-sm font-bold text-white disabled:opacity-50">
                {submitting ? 'Saving...' : seatsLeft > 0 ? 'Create invitation' : 'Household full'}
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">The invitation expires after 14 days. The email must match their verified PM Workspace account.</p>
          </form>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">People with access</p>
                <p className="mt-1 text-sm text-slate-600">{activeMembers.length} active · {pendingMembers.length} pending</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">{seatsLeft} left</span>
            </div>
            <div className="mt-3 space-y-2">
              {loading ? <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Loading family access...</p> : null}
              {!loading ? activeMembers.map(renderMember) : null}
              {!loading ? pendingMembers.map(renderMember) : null}
              {!loading && reservedSeats === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Only you can access this household plan.</p> : null}
            </div>
          </div>

          {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}
          {message ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}
