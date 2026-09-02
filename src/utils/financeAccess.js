export const EMPTY_FINANCE_HOUSEHOLD_ACCESS = Object.freeze({
  ownerUserId: '',
  role: '',
  isOwner: false,
  hasAccess: false,
  pendingInvitationId: '',
  pendingInvitationExpiresAt: '',
});

export const normalizeFinanceHouseholdAccess = (row = null) => ({
  ownerUserId: String(row?.owner_user_id || ''),
  role: String(row?.role || ''),
  isOwner: row?.is_owner === true,
  hasAccess: row?.has_access === true && Boolean(row?.owner_user_id),
  pendingInvitationId: String(row?.pending_invitation_id || ''),
  pendingInvitationExpiresAt: String(row?.pending_invitation_expires_at || ''),
});

export const canAccessFinancePlanner = (access = null) => Boolean(
  access?.hasAccess && access?.ownerUserId
);

export const hasPendingFinanceInvitation = (access = null) => Boolean(
  !canAccessFinancePlanner(access) && access?.pendingInvitationId
);
