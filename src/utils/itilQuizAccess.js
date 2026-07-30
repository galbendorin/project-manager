export const ITIL_QUIZ_ALLOWED_EMAILS = new Set([
  'galben.dorin@yahoo.com',
  'carlo.capaldo@gtt.net',
  'elinor.iv@gmail.com',
]);

export const normalizeAccessEmail = (email = '') => (
  String(email || '').trim().toLowerCase()
);

export const canAccessItilQuiz = (email = '') => (
  ITIL_QUIZ_ALLOWED_EMAILS.has(normalizeAccessEmail(email))
);
