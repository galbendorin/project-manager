import React from 'react';
import { FEEDBACK_EMAIL } from '../utils/feedback';

const LEGAL_CONTENT = {
  privacy: {
    eyebrow: 'Privacy',
    title: 'Privacy Notice',
    intro:
      'PM OS helps teams manage live delivery work. This notice explains what information we collect, how we use it, and how to contact us if you need help with your data.',
    sections: [
      {
        heading: 'What we collect',
        body:
          'We collect account details such as name, email address, and authentication data, along with the project information you choose to store in PM OS. That can include schedules, risks, issues, actions, decisions, stakeholder details, notes, and status-report content.',
      },
      {
        heading: 'How we use it',
        body:
          'We use this information to provide the workspace, secure accounts, support users, improve product reliability, and generate in-app outputs such as reports. We also use operational data needed for billing, troubleshooting, and abuse prevention.',
      },
      {
        heading: 'Third-party services',
        body:
          'PM OS relies on third-party providers for infrastructure and product operations, including hosting, authentication, payments, and AI-assisted features. Those providers may process data on our behalf to deliver the service.',
      },
      {
        heading: 'AI-assisted features',
        body:
          'If you use AI generation features, project context may be sent to the configured AI provider to create report output. Teams should avoid entering highly sensitive personal data into AI-assisted workflows unless they have reviewed whether that is appropriate for their use case.',
      },
      {
        heading: 'Your choices',
        body:
          'You can contact us if you want help with access, export, correction, or deletion requests. We will work with you on those requests in line with the service setup and any legal obligations that apply.',
      },
    ],
  },
  terms: {
    eyebrow: 'Terms',
    title: 'Terms of Use',
    intro:
      'These terms describe the basic rules for using PM OS during this stage of the product. They are intended to set clear expectations for account use, service access, and acceptable behavior.',
    sections: [
      {
        heading: 'Using the service',
        body:
          'You may use PM OS for legitimate project delivery and collaboration work. You are responsible for the accuracy of the information you enter and for protecting access to your account.',
      },
      {
        heading: 'Accounts and access',
        body:
          'You must provide accurate sign-up information and keep your login credentials secure. We may suspend access if we reasonably believe an account is being used improperly or in a way that threatens the service or other users.',
      },
      {
        heading: 'Acceptable use',
        body:
          'You must not use PM OS to break the law, interfere with the platform, attempt unauthorized access, or store content that you do not have the right to use. Teams remain responsible for the data they upload and share.',
      },
      {
        heading: 'Billing and plan access',
        body:
          'Some features are plan-dependent. Trial and paid access are governed by the workspace plan attached to the account, and billing changes are handled inside the product where applicable.',
      },
      {
        heading: 'Product changes',
        body:
          'PM OS is still evolving. We may improve, change, or retire features over time as part of product development, security work, or service operations.',
      },
      {
        heading: 'Contact',
        body:
          `If you need help, want to report a concern, or need a copy of the current legal terms shared directly, contact us at ${FEEDBACK_EMAIL}.`,
      },
    ],
  },
};

export default function LegalPage({ page = 'privacy' }) {
  const content = LEGAL_CONTENT[page] || LEGAL_CONTENT.privacy;

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }} className="min-h-screen bg-[#f5efe6] text-slate-900">
      <div className="relative overflow-x-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)',
              backgroundSize: '72px 72px',
            }}
          />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/75 to-transparent" />
          <div className="absolute -left-24 top-28 h-72 w-72 rounded-full bg-teal-200/50 blur-3xl" />
          <div className="absolute right-[-7rem] top-20 h-80 w-80 rounded-full bg-amber-100/65 blur-3xl" />
          <div className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full bg-emerald-100/45 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <header className="rounded-[32px] border border-slate-200/85 bg-white/88 px-5 py-4 shadow-[0_24px_90px_-54px_rgba(15,23,42,0.42)] backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <a
                  href="/"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-extrabold text-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.9)] transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  PM
                </a>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-teal-700">PM OS</p>
                  <div className="text-lg font-semibold text-slate-950 sm:text-xl">{content.title}</div>
                </div>
              </div>

              <a
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-slate-300/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                Back to PM OS
              </a>
            </div>
          </header>

          <main className="mt-8 rounded-[34px] border border-slate-200/85 bg-white/86 p-6 shadow-[0_36px_120px_-70px_rgba(15,23,42,0.4)] backdrop-blur sm:p-8">
            <div className="max-w-3xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-700">{content.eyebrow}</p>
              <h1
                style={{ fontFamily: "'Fraunces', serif" }}
                className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-5xl"
              >
                {content.title}
              </h1>
              <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">{content.intro}</p>
              <p className="mt-4 text-sm text-slate-400">Last updated: 19 March 2026</p>
            </div>

            <div className="mt-8 space-y-5">
              {content.sections.map((section) => (
                <section
                  key={section.heading}
                  className="rounded-[28px] border border-slate-200 bg-[#faf8f2] p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)]"
                >
                  <h2 className="text-lg font-semibold text-slate-950">{section.heading}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{section.body}</p>
                </section>
              ))}
            </div>

            <div className="mt-8 rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 text-sm leading-7 text-slate-600">
              These pages are a practical first pass for the live product surface. They should still be reviewed and
              refined alongside your broader GDPR and legal rollout work.
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
