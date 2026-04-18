import {
  COMPANY_NAME,
  PRIVACY_EMAIL,
  PRODUCT_NAME,
  SUPPORT_CONFIG,
  SUPPORT_EMAIL,
} from './feedback';

const LAST_UPDATED = '24 March 2026';

export const LEGAL_NAV_ITEMS = [
  { id: 'privacy', label: 'Privacy', href: '/privacy' },
  { id: 'terms', label: 'Terms', href: '/terms' },
  { id: 'cookies', label: 'Cookies', href: '/cookie-storage-notice' },
  { id: 'privacy-requests', label: 'Privacy Requests', href: '/privacy-requests' },
  { id: 'subprocessors', label: 'Subprocessors', href: '/subprocessors' },
];

const contactSidebar = {
  title: 'Contacts',
  items: [
    { label: 'Service', value: COMPANY_NAME },
    { label: 'Product', value: PRODUCT_NAME },
    { label: 'Support', value: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
    { label: 'Privacy', value: PRIVACY_EMAIL, href: `mailto:${PRIVACY_EMAIL}` },
    { label: 'Website', value: 'pmworkspace.com', href: SUPPORT_CONFIG.website },
    { label: 'Updated', value: LAST_UPDATED },
  ],
};

export const LEGAL_CONTENT = {
  privacy: {
    eyebrow: 'Privacy Notice',
    title: `${PRODUCT_NAME} Privacy Notice`,
    intro:
      `This notice explains how ${PRODUCT_NAME} collects, uses, shares, retains, and protects personal data across the public website, account creation, billing, support, and in-app features.`,
    summary:
      'This notice is written for UK users and is also intended to support broader GDPR transparency for users in the EEA and Switzerland where applicable.',
    sidebar: contactSidebar,
    sections: [
      {
        heading: 'Who we are and how we act',
        paragraphs: [
          `When users create accounts, manage billing, request support, or use the website, ${PRODUCT_NAME} normally acts as a data controller for that personal data.`,
          `For customer workspace content uploaded or managed inside the service, we generally act as a processor or service provider on behalf of the relevant customer organisation, which remains responsible for deciding how that content is used.`,
        ],
      },
      {
        heading: 'Personal data we collect',
        listItems: [
          'Website and technical data such as IP address, browser type, device information, approximate location derived from IP, request metadata, and security events.',
          'Account and profile data such as name, work email, account identifier, organisation or workspace name, authentication metadata, and plan or trial status.',
          'Workspace and project data such as schedules, tasks, RAID items, stakeholder records, notes, imports, exports, and other user-generated content entered into the service.',
          'Billing and subscription data such as Stripe customer and subscription references, invoice and payment status information, and limited transaction metadata.',
          'Support and communications data such as emails, issue reports, feature requests, screenshots, attachments, and page context reasonably needed to investigate a request.',
          'AI feature data such as selected prompts, project context, and generated outputs when AI-enabled features are used.',
          'Essential browser storage and session data used to keep users signed in, preserve service continuity, and maintain security controls.',
        ],
      },
      {
        heading: 'How we use personal data',
        listItems: [
          'To create and manage accounts, authenticate users, host workspaces, store project data, and provide imports, exports, backups, and core product functionality.',
          'To create and manage subscriptions, process payments through Stripe, issue invoices, and manage payment failures or upgrades.',
          'To monitor service integrity, detect abuse, investigate incidents, and enforce platform rules.',
          'To answer support requests, troubleshoot issues, and respond to privacy or security requests.',
          'To operate AI-enabled features that users actively request.',
          'To comply with legal, regulatory, accounting, tax, or enforcement obligations and to establish, exercise, or defend legal claims.',
        ],
        note: 'We normally rely on performance of a contract, legitimate interests, and legal obligations as the primary legal bases. Where consent is required by law, we request it separately.',
      },
      {
        heading: 'Who we share personal data with',
        listItems: [
          'Supabase for authentication, database infrastructure, and related managed services.',
          'Vercel for hosting, deployment, and serverless runtime operations.',
          'Stripe for subscriptions, payments, invoices, and billing operations.',
          'Google Gemini and other supported AI providers when AI-enabled features are used.',
          'Professional advisers, insurers, auditors, regulators, law enforcement, courts, acquirers, or other parties where legally required or reasonably necessary.',
        ],
      },
      {
        heading: 'International transfers and retention',
        paragraphs: [
          'Some providers may process personal data outside the UK or EEA. Where required, we rely on adequacy decisions, the UK International Data Transfer Addendum, the EU Standard Contractual Clauses, or another lawful safeguard recognised under applicable data protection law.',
          'We keep personal data only for as long as necessary for the purpose for which it was collected, subject to legal, accounting, security, anti-fraud, and dispute-related needs. Account data is retained for the life of the account and a limited period afterwards; workspace data remains until deleted by the customer or removed through account closure, subject to short backup retention windows; billing, tax, and support records are retained for operational or legal reasons where required.',
        ],
      },
      {
        heading: 'Your rights',
        listItems: [
          'Access your personal data.',
          'Receive a portable copy of certain personal data.',
          'Correct inaccurate personal data.',
          'Ask us to delete personal data in applicable cases.',
          'Ask us to restrict certain processing.',
          'Object to certain processing carried out on legitimate-interest grounds.',
          'Withdraw consent where processing relies on consent.',
          'Complain to the ICO or another relevant supervisory authority.',
        ],
        note: `To exercise a right, contact ${PRIVACY_EMAIL}. We may need to verify identity before acting on a request. If a request relates mainly to workspace data processed for a business customer, we may need to work with that customer administrator.`,
      },
      {
        heading: 'AI-enabled features',
        paragraphs: [
          'AI-enabled features are intended to assist users with drafts, summaries, and operational outputs. They may produce inaccurate, incomplete, or biased content and should be reviewed by a human before use.',
          'Unless we expressly agree otherwise in writing, users must not upload special-category personal data or highly sensitive confidential data into AI features.',
        ],
      },
      {
        heading: 'Contact and complaints',
        paragraphs: [
          `Privacy requests: ${PRIVACY_EMAIL}`,
          `Support and general questions: ${SUPPORT_EMAIL}`,
          'We would appreciate the opportunity to address concerns first, but users in the UK can also complain to the Information Commissioner\'s Office.',
        ],
      },
    ],
  },
  terms: {
    eyebrow: 'Terms of Service',
    title: `${PRODUCT_NAME} Terms of Service`,
    intro:
      `${PRODUCT_NAME} is provided as a software service for professional project, reporting, planning, and collaboration work. These Terms govern access to the website, application, and related services.`,
    summary:
      'These terms are written to support professional and business use, while preserving mandatory consumer protections where they apply.',
    sidebar: contactSidebar,
    sections: [
      {
        heading: 'Using the service',
        paragraphs: [
          'By creating an account, starting a trial, buying a subscription, or otherwise using the service, you agree to these Terms. If you use the service for an organisation, you confirm that you have authority to bind that organisation.',
          'You must be at least 18 years old, or old enough to form a binding contract in your jurisdiction, and you must use the service only in compliance with applicable law.',
        ],
      },
      {
        heading: 'Accounts and security',
        listItems: [
          'Provide accurate registration information and keep it reasonably up to date.',
          'Keep login credentials confidential and protect access to your account.',
          `Notify us promptly at ${SUPPORT_EMAIL} if you suspect unauthorised access, credential compromise, or misuse of your account.`,
          'We may suspend access if there is material misuse, a security risk, non-payment of undisputed fees, or another lawful reason to do so.',
        ],
      },
      {
        heading: 'Subscriptions, billing, and taxes',
        paragraphs: [
          'Some parts of the service are offered on a trial, free, or subscription basis. Pricing, billing intervals, feature limits, and trial conditions are shown at the point of signup or purchase.',
          'Paid subscriptions renew automatically for the selected billing cycle unless cancelled before the next renewal date, unless we expressly state otherwise. Payments are processed through Stripe or another named payment provider.',
          'If payment fails, we may retry payment, limit access to paid features, downgrade the account, or suspend service until payment is received.',
        ],
      },
      {
        heading: 'Customer data and acceptable use',
        paragraphs: [
          'You retain ownership of the content, data, files, and materials that you or your authorised users upload or enter into the service.',
          'You grant us a non-exclusive right to host, copy, process, transmit, display, and otherwise use customer data as necessary to operate, secure, support, and improve the service and to perform our obligations under these Terms.',
        ],
        listItems: [
          'Do not upload unlawful content, infringing content, malware, or data that you do not have the right to use.',
          'Do not probe or disrupt the service, attempt unauthorised access, scrape the platform abusively, or use the service to build a competing product.',
          'Do not upload special-category personal data or highly sensitive personal data into AI features unless we have expressly agreed in writing to support that use.',
        ],
      },
      {
        heading: 'AI features',
        paragraphs: [
          'AI-assisted features may send selected customer data, prompts, and instructions to third-party AI providers in order to generate requested outputs.',
          'AI-generated content may be incomplete, inaccurate, biased, outdated, or unsuitable for a specific use. You are responsible for reviewing and validating AI-generated outputs before relying on them.',
        ],
      },
      {
        heading: 'Availability, termination, and liability',
        paragraphs: [
          'We aim to keep the service available and secure, but we do not guarantee uninterrupted or error-free operation. We may suspend the service for maintenance, upgrades, legal compliance, emergency fixes, or security reasons.',
          'On termination or expiry, the right to use the service ends. We may delete or anonymise customer data after a reasonable post-termination period, subject to backup cycles, legal retention duties, dispute preservation, and legitimate record-keeping.',
          'Nothing in these Terms excludes liability that cannot lawfully be excluded. Subject to mandatory law, our total aggregate liability will not exceed the greater of the total fees paid in the 12 months before the relevant event or GBP 100.',
        ],
      },
      {
        heading: 'Law, changes, and contact',
        paragraphs: [
          'These Terms are governed by the laws of England and Wales unless mandatory local consumer law requires otherwise.',
          'We may change the service and these Terms from time to time. If we make a material change, we will take reasonable steps to notify users by email, in-product notice, or updated website text.',
          `Questions about these Terms, billing, privacy, or a legal notice can be sent to ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
  cookies: {
    eyebrow: 'Cookie & Storage Notice',
    title: `${PRODUCT_NAME} Cookie & Storage Notice`,
    intro:
      `${PRODUCT_NAME} currently uses only essential cookies, local storage, session storage, and similar technologies needed to run the service securely, maintain sessions, and preserve required product state.`,
    summary:
      'Because the current setup is essential-only, consent is not usually required under UK rules. Clear transparency is still required, and this page explains the current baseline.',
    sidebar: {
      title: 'Current position',
      items: [
        { label: 'Non-essential analytics', value: 'Not present in the current codebase' },
        { label: 'Cookie banner', value: 'Not required for the current essential-only setup' },
        { label: 'Privacy contact', value: PRIVACY_EMAIL, href: `mailto:${PRIVACY_EMAIL}` },
        { label: 'Updated', value: LAST_UPDATED },
      ],
    },
    sections: [
      {
        heading: 'Why storage is used',
        listItems: [
          'Keep users signed in and refresh authentication state.',
          'Preserve essential product preferences and first-run state.',
          'Coordinate short-lived billing return flows.',
          'Support AI bring-your-own-key settings stored only in the user\'s browser.',
        ],
      },
      {
        heading: 'Current browser storage inventory',
        table: {
          columns: ['Name / Key', 'Type', 'Provider', 'Purpose', 'Duration', 'Strictly necessary?'],
          rows: [
            [
              'sb-jbmcmtzizlckhgpogbev-auth-token',
              'localStorage',
              'Supabase',
              'Authentication session continuity for signed-in users',
              'Managed by Supabase session lifecycle',
              'Yes',
            ],
            [
              'pm_os_ai_settings',
              'localStorage',
              'First party',
              'Stores AI provider choice and any browser-local BYOK settings',
              'Persistent until changed or cleared by the user',
              'Yes for optional feature continuity',
            ],
            [
              'pmos.billing-sync-pending',
              'sessionStorage',
              'First party',
              'Tracks a short-lived post-checkout or billing-portal return refresh state',
              'Current browser session only',
              'Yes',
            ],
          ],
        },
        note: 'The Supabase authentication entry name is provider-managed. The exact key format can change if the Supabase project reference changes.',
      },
      {
        heading: 'Non-essential analytics or marketing',
        paragraphs: [
          'The current codebase does not include analytics, ad tech, session replay, heatmaps, or marketing tags. If non-essential technologies are introduced later, this notice will be updated and consent controls will need to be added where required.',
        ],
      },
      {
        heading: 'Browser controls',
        paragraphs: [
          'Most browsers allow cookies and storage entries to be removed or blocked. Blocking strictly necessary technologies may stop login, billing return flows, or core workspace functions from working properly.',
        ],
      },
    ],
  },
  'privacy-requests': {
    eyebrow: 'Privacy Requests',
    title: 'Privacy and Data Requests',
    intro:
      `Use this page to request access, correction, deletion, restriction, portability, or to raise a privacy concern with ${PRODUCT_NAME}.`,
    summary:
      'Requests are handled by email. We may ask for reasonable proof of identity before acting on a request.',
    sidebar: {
      title: 'Request route',
      items: [
        { label: 'Email', value: PRIVACY_EMAIL, href: `mailto:${PRIVACY_EMAIL}` },
        { label: 'Verification', value: 'Reasonable identity checks may apply' },
        { label: 'Response timing', value: 'Without undue delay and within legal deadlines' },
        { label: 'Updated', value: LAST_UPDATED },
      ],
    },
    sections: [
      {
        heading: 'What you can ask for',
        listItems: [
          'Confirmation of whether we process your personal data.',
          'Access to your personal data.',
          'Correction of inaccurate personal data.',
          'Deletion of personal data where applicable.',
          'Restriction of certain processing.',
          'A portable copy of certain personal data.',
          'Review of an objection to processing carried out on legitimate-interest grounds.',
          'Recording of marketing preferences or withdrawal of consent where consent applies.',
        ],
      },
      {
        heading: 'How to submit a request',
        listItems: [
          'Your name.',
          'The email address linked to your account.',
          'The organisation or workspace name if relevant.',
          'The right you want to exercise.',
          'Enough detail for us to identify the data or issue.',
        ],
        note: `Send requests to ${PRIVACY_EMAIL}.`,
      },
      {
        heading: 'Identity checks and business-customer data',
        paragraphs: [
          'To protect users and customers, we may ask for reasonable proof of identity before acting on a request.',
          'Where a request relates to business-customer workspace data, we may need to involve the relevant customer administrator because that organisation may control how the data is used.',
        ],
      },
      {
        heading: 'Deletion and export expectations',
        paragraphs: [
          'Where an account is deleted, active service data associated with the account and workspace is removed in line with the deletion process, subject to short-lived backup retention and lawful retention for billing, tax, fraud prevention, security, disputes, and legal compliance.',
          'Where technically feasible and legally required, relevant data will be provided in a structured, commonly used, and machine-readable format.',
        ],
      },
      {
        heading: 'Complaints',
        paragraphs: [
          `If you are not satisfied with how a request has been handled, contact ${PRIVACY_EMAIL} first. Users in the UK may also complain to the ICO or another relevant supervisory authority.`,
        ],
      },
    ],
  },
  subprocessors: {
    eyebrow: 'Subprocessors',
    title: 'Subprocessors and International Transfers',
    intro:
      `${PRODUCT_NAME} uses carefully selected service providers to host, secure, support, and operate the service. Where those providers handle customer workspace data on our behalf, they act as processors or subprocessors under written terms and appropriate safeguards.`,
    summary:
      'The list below reflects the main providers currently used to operate the service.',
    sidebar: {
      title: 'Business customer info',
      items: [
        { label: 'DPA requests', value: PRIVACY_EMAIL, href: `mailto:${PRIVACY_EMAIL}` },
        { label: 'Current AI route', value: 'Gemini and supported BYOK providers where enabled' },
        { label: 'Review cadence', value: 'Update before material provider changes' },
        { label: 'Updated', value: LAST_UPDATED },
      ],
    },
    sections: [
      {
        heading: 'Current key providers',
        table: {
          columns: ['Provider', 'Role', 'Typical data involved', 'Why we use them', 'Transfer note'],
          rows: [
            [
              'Supabase',
              'Infrastructure / authentication / database processor',
              'Account data, workspace data, authentication metadata',
              'Host database and auth flows',
              'May involve cross-border processing depending on selected region and provider setup',
            ],
            [
              'Vercel',
              'Hosting / deployment processor',
              'Website traffic data, server/request metadata, limited app data in logs',
              'Host and deliver the application',
              'May involve cross-border processing',
            ],
            [
              'Stripe',
              'Payments processor and independent controller for some payment activities',
              'Billing contact details, payment metadata, invoices, fraud signals',
              'Process subscriptions and payments',
              'International payment infrastructure and vendor subprocessors may be involved',
            ],
            [
              'Google / Gemini',
              'AI provider when AI features are enabled',
              'Prompts, selected workspace or project context, generated outputs',
              'Generate AI-assisted features requested by the user',
              'May involve cross-border processing; organisation-specific settings may alter the route',
            ],
          ],
        },
      },
      {
        heading: 'International transfers',
        paragraphs: [
          'Where providers process personal data outside the UK or EEA, we rely on an appropriate transfer mechanism such as adequacy, approved standard contractual clauses, the UK addendum, or another lawful safeguard recognised under applicable data protection law.',
        ],
      },
      {
        heading: 'Change management and objections',
        paragraphs: [
          'This page will be updated before a new subprocessor begins handling customer workspace data in a materially different way. Unless a shorter period is necessary for urgent security, legal, or business continuity reasons, the aim is to give at least 14 days\' notice of a material addition or replacement.',
          `Business customers may object to a new or replacement subprocessor on reasonable data-protection grounds by contacting ${PRIVACY_EMAIL} within the relevant notice period.`,
        ],
      },
    ],
  },
};

export function getLegalPage(page) {
  return LEGAL_CONTENT[page] || LEGAL_CONTENT.privacy;
}

export { LAST_UPDATED };
