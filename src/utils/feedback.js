const env = import.meta.env || {};

export const PRODUCT_NAME = String(env.VITE_PUBLIC_PRODUCT_NAME || 'PM Workspace').trim() || 'PM Workspace';
export const COMPANY_NAME = String(env.VITE_PUBLIC_OPERATOR_NAME || PRODUCT_NAME).trim() || PRODUCT_NAME;
export const SUPPORT_EMAIL = String(env.VITE_PUBLIC_SUPPORT_EMAIL || 'support@pmworkspace.com').trim() || 'support@pmworkspace.com';
export const PRIVACY_EMAIL = String(env.VITE_PUBLIC_PRIVACY_EMAIL || SUPPORT_EMAIL).trim() || SUPPORT_EMAIL;
export const FEEDBACK_EMAIL = SUPPORT_EMAIL;
export const SUPPORT_CONFIG = Object.freeze({
  companyName: COMPANY_NAME,
  productName: PRODUCT_NAME,
  supportEmail: SUPPORT_EMAIL,
  privacyEmail: PRIVACY_EMAIL,
  feedbackEmail: FEEDBACK_EMAIL,
  website: String(env.VITE_PUBLIC_SITE_URL || 'https://pmworkspace.com').trim() || 'https://pmworkspace.com',
});

const TAB_LABELS = {
  schedule: 'Project Plan',
  tracker: 'Master Tracker',
  statusreport: 'Status Report',
  todo: 'Tasks',
  risks: 'Risks',
  issues: 'Issues',
  actions: 'Action Log',
  minutes: 'Meeting Log',
  changes: 'Change Log',
  costs: 'Financials',
  stakeholders: 'Stakeholders',
  stakeholdersmgmt: 'Stakeholder Management',
  commsplan: 'Comms Plan',
  assumptions: 'Assumptions',
  decisions: 'Decisions',
  lessons: 'Lessons Learned',
  raci: 'RACI',
  financials: 'Financials',
};

function getSectionLabel(tab, subView) {
  if (subView && TAB_LABELS[subView]) return TAB_LABELS[subView];
  if (tab && TAB_LABELS[tab]) return TAB_LABELS[tab];
  return 'General feedback';
}

function buildSubject({ projectName, tab, subView }) {
  const section = getSectionLabel(tab, subView);
  return projectName
    ? `${PRODUCT_NAME} feedback - ${projectName} - ${section}`
    : `${PRODUCT_NAME} feedback - ${section}`;
}

function buildBody({ projectName, tab, subView }) {
  const locationHref = typeof window !== 'undefined' ? window.location.href : 'Unknown';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  const section = getSectionLabel(tab, subView);

  return [
    'Hello,',
    '',
    'I want to report a bug / share feedback / request an improvement.',
    '',
    'What happened?',
    '',
    'What did you expect instead?',
    '',
    'Steps to reproduce (if relevant):',
    '',
    'Extra context:',
    `- Project: ${projectName || 'Not signed in'}`,
    `- Section: ${section}`,
    `- Page: ${locationHref}`,
    `- Device: ${userAgent}`,
  ].join('\n');
}

export function openFeedbackEmail(context = {}) {
  if (typeof window === 'undefined') return;

  const mailtoHref = `mailto:${SUPPORT_CONFIG.feedbackEmail}?subject=${encodeURIComponent(buildSubject(context))}&body=${encodeURIComponent(buildBody(context))}`;
  window.location.href = mailtoHref;
}
