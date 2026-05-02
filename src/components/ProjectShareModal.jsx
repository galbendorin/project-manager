import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeInviteEmail } from '../utils/projectSharing';

const MAX_PROJECT_EDITORS = 5;

const getApiErrorMessage = async (response, fallbackMessage) => {
  try {
    const payload = await response.json();
    return payload?.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

const isMissingInviteTableError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42p01' || message.includes('project_member_invites');
};

const ProjectShareModal = ({
  isOpen,
  readOnly = false,
  project,
  onClose,
  onMembershipChanged,
}) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loadingPendingInvites, setLoadingPendingInvites] = useState(false);
  const [supportsPendingInvites, setSupportsPendingInvites] = useState(true);
  const closeButtonRef = useRef(null);

  const members = useMemo(
    () => (Array.isArray(project?.project_members) ? project.project_members : []),
    [project?.project_members]
  );
  const reservedSeats = members.length + pendingInvites.length;
  const slotsLeft = Math.max(0, MAX_PROJECT_EDITORS - reservedSeats);

  useEffect(() => {
    if (!isOpen) {
      setInviteEmail('');
      setSubmitting(false);
      setErrorMessage('');
      setSuccessMessage('');
      setPendingInvites([]);
      setLoadingPendingInvites(false);
      setSupportsPendingInvites(true);
      return;
    }

    setInviteEmail('');
    setErrorMessage('');
    setSuccessMessage('');
  }, [isOpen, project?.id]);

  const fetchPendingInvites = useCallback(async () => {
    if (!project?.id || !isOpen) return;
    setLoadingPendingInvites(true);
    const { data, error } = await supabase
      .from('project_member_invites')
      .select('id, member_email, role, created_at')
      .eq('project_id', project.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingInviteTableError(error)) {
        setSupportsPendingInvites(false);
        setPendingInvites([]);
      } else {
        console.error('Failed to load pending invites:', error);
        setErrorMessage('Unable to load pending invites right now.');
      }
    } else {
      setSupportsPendingInvites(true);
      setPendingInvites(data || []);
    }
    setLoadingPendingInvites(false);
  }, [isOpen, project?.id]);

  useEffect(() => {
    if (!isOpen || !project?.id) return;
    void fetchPendingInvites();
  }, [fetchPendingInvites, isOpen, project?.id]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [isOpen, onClose]);

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

  const refreshMembershipState = async () => {
    await onMembershipChanged?.();
    await fetchPendingInvites();
  };

  const handleInviteSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = normalizeInviteEmail(inviteEmail);

    if (!normalizedEmail) {
      setErrorMessage('Enter the email address for the account you want to add.');
      setSuccessMessage('');
      return;
    }

    if (slotsLeft <= 0) {
      setErrorMessage(`This project already has ${MAX_PROJECT_EDITORS} active or pending editors.`);
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
      setSuccessMessage(`Access is ready for ${normalizedEmail}. If they do not have an account yet, it will attach after signup.`);
      await refreshMembershipState();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to share this project right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!member?.user_id) return;
    if (!window.confirm(`Remove ${member.member_email} from this project?`)) return;

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await postToApi('/api/project-members-remove', {
        projectId: project.id,
        memberUserId: member.user_id,
      }, 'Unable to remove this collaborator right now.');

      setSuccessMessage(`${member.member_email} no longer has access.`);
      await refreshMembershipState();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to remove this collaborator right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveInvite = async (invite) => {
    if (!invite?.id) return;
    if (!window.confirm(`Remove the pending invite for ${invite.member_email}?`)) return;

    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await postToApi('/api/project-members-remove', {
        projectId: project.id,
        inviteId: invite.id,
      }, 'Unable to remove this pending invite right now.');

      setSuccessMessage(`Pending invite removed for ${invite.member_email}.`);
      await refreshMembershipState();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to remove this pending invite right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-0 sm:items-center sm:px-4">
      <button
        type="button"
        className="absolute inset-0 w-full cursor-default"
        onClick={onClose}
        aria-label="Close project access dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-share-title"
        className="relative z-10 flex max-h-[calc(100dvh-16px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-slate-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[28px]"
      >
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Project access</p>
              <h2 id="project-share-title" className="mt-1 break-words text-xl font-bold text-slate-900">{project.name}</h2>
              <p className="mt-2 text-sm text-slate-500">
                Add up to {MAX_PROJECT_EDITORS} editors. Existing accounts are added straight away; new accounts can accept access after signup.
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] sm:px-6 sm:pb-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {readOnly
              ? 'You can view and edit shared household records, but only the owner can add or remove access.'
              : 'Owner-only controls stay owner-only: sharing, project deletion, billing, and quota ownership.'}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current access</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {members.length} active editor{members.length === 1 ? '' : 's'} · {pendingInvites.length} pending
                    </p>
                  </div>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                    {slotsLeft} slot{slotsLeft === 1 ? '' : 's'} left
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">You</p>
                        <p className="text-xs text-slate-500">Project owner</p>
                      </div>
                      <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        Owner
                      </span>
                    </div>
                  </div>

                  {members.map((member) => (
                    <div key={member.id || member.user_id || member.member_email} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-all text-sm font-semibold text-slate-900">{member.member_email}</p>
                          <p className="mt-1 text-xs text-slate-500">Editor access</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                            Editor
                          </span>
                          {!readOnly ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(member)}
                              disabled={submitting}
                              className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}

                  {loadingPendingInvites ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      Loading pending invites...
                    </div>
                  ) : null}

                  {pendingInvites.map((invite) => (
                    <div key={invite.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-all text-sm font-semibold text-slate-900">{invite.member_email}</p>
                          <p className="mt-1 text-xs text-slate-500">Pending until this person signs up or signs in</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                            Pending
                          </span>
                          {!readOnly ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveInvite(invite)}
                              disabled={submitting}
                              className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}

                  {!members.length && !pendingInvites.length && !loadingPendingInvites ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      No editors added yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {!readOnly ? (
                <form onSubmit={handleInviteSubmit} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="space-y-3">
                    <div>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Invite by email
                      </span>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="name@example.com"
                        autoComplete="email"
                        disabled={submitting || slotsLeft <= 0}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                      Existing users get access straight away. If the email has not created an account yet, the access will attach after signup.
                    </p>
                    <button
                      type="submit"
                      disabled={submitting || slotsLeft <= 0}
                      className="w-full rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {submitting ? 'Saving access...' : slotsLeft <= 0 ? 'Project at capacity' : 'Share Project'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Shared household</div>
                  <p className="mt-2 leading-6">
                    This dashboard follows the same access as the shared grocery list. Ask the owner to add or remove people.
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Sharing rules</div>
                <div className="mt-3 space-y-2">
                  <p>Up to {MAX_PROJECT_EDITORS} editors per project.</p>
                  <p>Editors can work in the shared project, but owner-only controls remain with you.</p>
                  {!supportsPendingInvites ? (
                    <p className="text-amber-700">Pending invite storage is not configured yet. Apply the latest sharing SQL migration before inviting new emails.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ProjectShareModal;
