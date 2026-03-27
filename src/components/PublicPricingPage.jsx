import React from 'react';
import { COMPANY_NAME } from '../utils/feedback';
import PmWorkspaceLogo from './PmWorkspaceLogo';

const STARTER_FEATURES = [
  '3 projects',
  '30 tasks per project',
  'Schedule, Issues, Actions, and Tracker',
  'Import and export to Excel',
];

const PRO_FEATURES = [
  'Unlimited projects',
  '500 tasks per project',
  'All tabs and registers',
  'Import and export to Excel',
  'AI reports and AI assistant access',
  'Baseline snapshots',
];

export default function PublicPricingPage() {
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
          <div className="absolute -left-20 top-24 h-72 w-72 rounded-full bg-teal-200/40 blur-3xl" />
          <div className="absolute right-[-6rem] top-16 h-80 w-80 rounded-full bg-amber-100/60 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <header className="rounded-[32px] border border-slate-200/85 bg-white/88 px-5 py-4 shadow-[0_24px_90px_-54px_rgba(15,23,42,0.42)] backdrop-blur">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <a
                  href="/"
                  className="inline-flex transition hover:opacity-90"
                >
                  <PmWorkspaceLogo size="sm" />
                </a>
                <div>
                  <div className="text-lg font-semibold text-slate-950 sm:text-xl">Pricing</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a href="/privacy" className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-[#faf8f2] hover:text-slate-950">Privacy</a>
                <a href="/terms" className="rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-[#faf8f2] hover:text-slate-950">Terms</a>
                <a href="/" className="inline-flex items-center justify-center rounded-full border border-slate-300/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white">
                  Back to PM Workspace
                </a>
              </div>
            </div>
          </header>

          <main className="mt-8 rounded-[34px] border border-slate-200/85 bg-white/86 p-6 shadow-[0_36px_120px_-70px_rgba(15,23,42,0.4)] backdrop-blur sm:p-8">
            <div className="max-w-3xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-700">Plans</p>
              <h1 style={{ fontFamily: "'Fraunces', serif" }} className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-5xl">
                A simple plan structure for solo operators and growing teams
              </h1>
              <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
                Start with Starter, open the full Pro trial without a card, and move into paid access only when the workspace is already proving useful.
              </p>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="rounded-[28px] border border-slate-200 bg-[#faf8f2] p-6">
                <div className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">Starter</div>
                <div className="mt-3 text-4xl font-bold text-slate-950">GBP 0</div>
                <p className="mt-2 text-sm text-slate-500">Free forever for light personal or early project use.</p>
                <ul className="mt-5 space-y-3 text-sm text-slate-600">
                  {STARTER_FEATURES.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <a href="/" className="mt-6 inline-flex rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50">
                  Create free account
                </a>
              </section>

              <section className="rounded-[28px] border border-slate-900 bg-slate-950 p-6 text-white shadow-[0_32px_80px_-54px_rgba(15,23,42,0.82)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold uppercase tracking-[0.16em] text-teal-300">Pro</div>
                  <span className="rounded-full border border-teal-300/30 bg-teal-300/10 px-3 py-1 text-[11px] font-semibold text-teal-100">
                    Full trial available first
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-3">
                  <div className="text-4xl font-bold">GBP 7.99</div>
                  <div className="text-sm text-slate-300">per month</div>
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Annual billing is also available at GBP 67 per year. Cancel anytime from the billing portal.
                </p>
                <ul className="mt-5 space-y-3 text-sm text-slate-200">
                  {PRO_FEATURES.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-teal-300" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <a href="/" className="mt-6 inline-flex rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-slate-100">
                  Start free trial
                </a>
              </section>
            </div>

            <div className="mt-8 rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 text-sm leading-7 text-slate-600">
              PM Workspace is operated by {COMPANY_NAME}. See the public legal pages before creating an account: <a href="/privacy" className="font-semibold underline decoration-slate-300 underline-offset-4">Privacy Notice</a>, <a href="/terms" className="font-semibold underline decoration-slate-300 underline-offset-4">Terms of Service</a>, <a href="/cookie-storage-notice" className="font-semibold underline decoration-slate-300 underline-offset-4">Cookie &amp; Storage Notice</a>, and <a href="/privacy-requests" className="font-semibold underline decoration-slate-300 underline-offset-4">Privacy Requests</a>.
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
