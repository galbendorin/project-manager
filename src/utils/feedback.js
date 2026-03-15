export const FEEDBACK_EMAIL = 'galben.dorin@yahoo.com';

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
    ? `PM OS feedback - ${projectName} - ${section}`
    : `PM OS feedback - ${section}`;
}

function buildBody({ projectName, tab, subView }) {
  const locationHref = typeof window !== 'undefined' ? window.location.href : 'Unknown';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  const section = getSectionLabel(tab, subView);

  return [
    'Hi Dorin,',
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

  const mailtoHref = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(buildSubject(context))}&body=${encodeURIComponent(buildBody(context))}`;
  window.location.href = mailtoHref;
}
