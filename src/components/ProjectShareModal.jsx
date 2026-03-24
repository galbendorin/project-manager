import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeInviteEmail } from '../utils/projectSharing';

const getApiErrorMessage = async (response, fallbackMessage) => {
  try {
    const payload = await response.json();
    return payload?.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

const ProjectShareModal = ({
  isOpen,
  project,
  onClose,
  onMembershipChanged,
}) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const collaborator = project?.collaborator || null;

  useEffect(() => {
    if (!isOpen) {
      setInviteEmail('');
      setSubmitting(false);
      setErrorMessage('');
      setSuccessMessage('');
      return;
    }

    setInviteEmail('');
    setErrorMessage('');
    setSuccessMessage('');
  }, [isOpen, project?.id]);

  if (!isOpen || !project) return null;

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token || '';
    if (!accessToken) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    return accessToken;
  };

  const postToApi = async (url, body, fallbackMessage) => {
    const accessToken = await getAccessToken();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, fallbackMessage));
    }

    try {
      return await response.json();
    } catch {
      return {};
    }
  };

  const handleInviteSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = normalizeInviteEmail(inviteEmail);

    if (!normalizedEmail) {
      setErrorMessage('Enter the email address for the account you want to add.');
      setSuccessMessage('');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await postToApi('/api/project-members-invite', {
        projectId: project.id,
        email: normalizedEmail,
      }, 'Unable to share this project right now.');

      setInviteEmail('');
      setSuccessMessage(`Shared with ${normalizedEmail}.`);
      await onMembershipChanged?.();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to share this project right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!collaborator) return;
    if (!window.confirm(`Remove ${collaborator.member_email} from this project?`)) return;

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await postToApi('/api/project-members-remove', {
        projectId: project.id,
        memberUserId: collaborator.user_id,
      }, 'Unable to remove this collaborator right now.');

      setSuccessMessage(`${collaborator.member_email} no longer has access.`);
      await onMembershipChanged?.();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to remove this collaborator right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Share Project
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{project.name}</h2>
            <p className="mt-2 text-sm text-slate-500">
              Invite one existing PM Workspace account to collaborate across this whole project.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close share dialog"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Owner-only controls stay owner-only: sharing, project deletion, billing, and quota ownership.
          </div>

          {collaborator ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Current Collaborator
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{collaborator.member_email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    This MVP supports one collaborator with editor access.
                  </p>
                </div>
                <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Editor
                </span>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={submitting}
                  className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Removing...' : 'Remove Access'}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleInviteSubmit} className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Invite By Email
                </span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                />
              </label>
              <p className="text-xs text-slate-500">
                The invited email must already belong to an existing PM Workspace account.
              </p>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {submitting ? 'Sharing...' : 'Share Project'}
                </button>
              </div>
            </form>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectShareModal;
