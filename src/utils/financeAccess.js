const FINANCE_ALLOWED_EMAILS = new Set([
  'galben.dorin@yahoo.com',
]);

export const normalizeFinanceAccessEmail = (email = '') => (
  String(email || '').trim().toLowerCase()
);

export const canAccessFinancePlanner = (email = '') => (
  FINANCE_ALLOWED_EMAILS.has(normalizeFinanceAccessEmail(email))
);
