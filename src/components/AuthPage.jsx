import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import PmWorkspaceLogo from './PmWorkspaceLogo';
import {
  TRIAL_FULL_ACCESS_LABEL,
  TRIAL_OFFER_LABEL,
  TRIAL_SHORT_LABEL,
} from '../utils/trialOffer';
import { FEEDBACK_EMAIL, openFeedbackEmail } from '../utils/feedback';

const AUDIENCE_TAGS = [
  'Consultancies',
  'Independent PMs',
  'Internal delivery teams',
];

const HERO_FEATURES = [
  {
    icon: 'workspace',
    title: 'Run delivery in one workspace',
    body: 'Plans, RAID, actions, and reporting stay connected instead of drifting across separate files.',
  },
  {
    icon: 'spreadsheet',
    title: 'Import from Excel, export when needed',
    body: 'Fit the way project teams already work without forcing a painful change on day one.',
  },
  {
    icon: 'trial',
    title: `${TRIAL_SHORT_LABEL} with full access`,
    body: 'Start without a card, open the full workspace, and decide later if you want to keep it.',
  },
];

const CAPABILITY_ITEMS = [
  {
    title: 'Plan the delivery path',
    body: 'Run schedules, milestones, workstreams, and dependencies from a live workspace instead of a stack of disconnected files.',
  },
  {
    title: 'Control the day-to-day',
    body: 'Keep RAID, actions, decisions, and stakeholders in the same operating layer the project team actually uses every week.',
  },
  {
    title: 'Report without rebuilding',
    body: 'Prepare client-ready status views and export the information when someone still needs a spreadsheet outside the tool.',
  },
  {
    title: 'Start free, upgrade later',
    body: `Create an account without a card, use the full ${TRIAL_OFFER_LABEL}, and move into paid access only when the workspace is proving useful.`,
  },
];

const AUTH_BENEFITS = [
  `${TRIAL_OFFER_LABEL} with full workspace access`,
  'No card required to create an account',
  'Email verification before the workspace opens',
];

const WORKSPACE_PHASES = [
  { title: 'Weekly client status pack', status: 'Drafted from live data', percent: 'Ready', tone: 'bg-emerald-400/20 text-emerald-200 border-emerald-400/20' },
  { title: 'RAID review for steering call', status: 'High-priority items surfaced', percent: '4 live', tone: 'bg-rose-400/20 text-rose-200 border-rose-400/20' },
  { title: 'Delivery checkpoint actions', status: 'Owners and dates aligned', percent: '7 due', tone: 'bg-amber-300/20 text-amber-100 border-amber-300/20' },
];

const CONTROL_ITEMS = [
  { value: '4', label: 'Open risks', tone: 'text-rose-200 border-rose-400/25 bg-rose-400/12' },
  { value: '7', label: 'Actions due', tone: 'text-amber-100 border-amber-300/25 bg-amber-300/12' },
  { value: '2', label: 'Decisions pending', tone: 'text-sky-100 border-sky-400/25 bg-sky-400/12' },
  { value: '1', label: 'Status pack drafted', tone: 'text-emerald-200 border-emerald-400/25 bg-emerald-400/12' },
];

const UPCOMING_ITEMS = [
  { title: 'RAID review prepared for the client checkpoint', meta: 'Mon · 09:00', tone: 'bg-rose-400' },
  { title: 'Status pack drafted directly from live registers', meta: 'Wed · 13:00', tone: 'bg-emerald-400' },
  { title: 'Dependency decisions confirmed with delivery leads', meta: 'Thu · 15:30', tone: 'bg-amber-300' },
];

const PREVIEW_PROOF_POINTS = [
  'Client-ready status reporting without rebuilding the same update in slides.',
  'Live RAID control that keeps risks, issues, and actions visible in one operating view.',
  'Weekly delivery signals that stay readable for both the team and the client.',
];

const SHOW_TRUST_BAND = true;

const TRUST_BAND_ITEMS = [
  'Project plan, RAID, actions, and reporting in one delivery layer.',
  'Client-ready weekly updates without rebuilding the same story in separate tools.',
  'Excel-friendly workflows that still give teams a cleaner operating model.',
];

const LANDING_NAV_ITEMS = [
  { label: 'Features', target: 'landing-features' },
  { label: 'Preview', target: 'landing-preview' },
];

const LANDING_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

const ONBOARDING_STEPS = [
  'Verify your email if your setup requires it',
  'Open your workspace',
  TRIAL_FULL_ACCESS_LABEL,
];

const LEGAL_LINKS = [
  { label: 'Privacy Notice', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Cookie & Storage Notice', href: '/cookie-storage-notice' },
  { label: 'Privacy Requests', href: '/privacy-requests' },
  { label: 'Subprocessors', href: '/subprocessors' },
];

function HeroFeatureIcon({ type }) {
  const shared = {
    className: 'h-5 w-5 text-slate-900',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
  };

  if (type === 'spreadsheet') {
    return (
      <svg {...shared}>
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
        <path d="M8 4v16" />
        <path d="M3.5 9h17" />
        <path d="M12.5 9v11" />
        <path d="M8 14.5h12.5" />
      </svg>
    );
  }

  if (type === 'trial') {
    return (
      <svg {...shared}>
        <path d="M12 3.5v3" />
        <path d="M12 17.5v3" />
        <path d="M5.6 5.6l2.1 2.1" />
        <path d="M16.3 16.3l2.1 2.1" />
        <path d="M3.5 12h3" />
        <path d="M17.5 12h3" />
        <path d="M5.6 18.4l2.1-2.1" />
        <path d="M16.3 7.7l2.1-2.1" />
        <circle cx="12" cy="12" r="4.5" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M3.5 9.5h17" />
      <path d="M7.5 13h3" />
      <path d="M13.5 13h3" />
      <path d="M7.5 16.5h3" />
      <path d="M13.5 16.5h3" />
    </svg>
  );
}

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  const { signIn, signUp } = useAuth();

  const switchMode = (nextIsLogin) => {
    setIsLogin(nextIsLogin);
    setError(null);
  };

  const jumpToAuth = (nextIsLogin) => {
    switchMode(nextIsLogin);
    setSuccessMessage('');

    window.requestAnimationFrame(() => {
      document.getElementById('auth-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const jumpToSignup = () => {
    jumpToAuth(false);
  };

  const jumpToSignIn = () => {
    jumpToAuth(true);
  };

  const jumpToSection = (sectionId) => {
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const handleOpenFeedback = () => {
    openFeedbackEmail({ tab: 'General feedback' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage('');

    try {
      if (isLogin) {
        const { error: signInError } = await signIn(email, password);
        if (signInError) throw signInError;
      } else {
        if (!acceptedLegal) {
          throw new Error('Please accept the Terms of Service and Privacy Notice to create an account.');
        }

        const { data, error: signUpError } = await signUp(email, password, fullName);
        if (signUpError) throw signUpError;

        if (data?.session) {
          setSuccessMessage('Your account is ready. Opening your workspace now.');
        } else {
          setSuccessMessage(`Check ${email} for your confirmation email if verification is enabled, then sign in to enter your workspace.`);
          setIsLogin(true);
        }
        setPassword('');
        setFullName('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <header className="sticky top-3 z-20">
            <div className="rounded-[32px] border border-slate-200/85 bg-white/88 px-4 py-4 shadow-[0_24px_90px_-54px_rgba(15,23,42,0.42)] backdrop-blur sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => jumpToSection('landing-hero')}
                    className={`inline-flex transition hover:opacity-90 ${LANDING_FOCUS_CLASS}`}
                    aria-label="Back to top"
                  >
                    <PmWorkspaceLogo size="sm" />
                  </button>
                  <div>
                    <h1 className="text-lg font-semibold text-slate-950 sm:text-xl">Project Delivery Workspace</h1>
                  </div>
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
                  <nav className="flex flex-wrap items-center gap-2" aria-label="Landing page">
                    {LANDING_NAV_ITEMS.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => jumpToSection(item.target)}
                        className={`rounded-full px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-[#faf8f2] hover:text-slate-950 ${LANDING_FOCUS_CLASS}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={jumpToSignIn}
                      className={`rounded-full border border-slate-300/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white ${LANDING_FOCUS_CLASS}`}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      onClick={jumpToSignup}
                      className={`rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.85)] transition hover:bg-slate-800 ${LANDING_FOCUS_CLASS}`}
                    >
                      Start free trial
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/80 pt-4">
                {AUDIENCE_TAGS.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-slate-300/80 bg-[#faf8f2] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </header>

          <main className="mt-10 space-y-8 xl:mt-14 xl:space-y-10">
            <section id="landing-hero" className="scroll-mt-28 grid items-start gap-8 xl:grid-cols-[1.03fr_0.97fr] xl:gap-10">
              <div className="space-y-6 xl:pr-4 xl:pt-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/75 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-teal-700 shadow-sm backdrop-blur">
                  Client-ready project operations
                </div>

                <div className="max-w-4xl">
                  <h2 className="text-4xl font-extrabold tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-[4.5rem] lg:leading-[0.95]">
                    Delivery control that feels
                    <span
                      style={{ fontFamily: "'Fraunces', serif" }}
                      className="mt-2 block font-semibold tracking-[-0.03em] text-teal-800"
                    >
                      calm, sharp, and client-ready.
                    </span>
                  </h2>
                  <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                    Plan schedules, manage RAID, track actions, prepare status reporting, and keep billing in the
                    same workspace built for serious project managers.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={jumpToSignup}
                    className={`rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.85)] transition hover:bg-slate-800 ${LANDING_FOCUS_CLASS}`}
                  >
                    Start free trial
                  </button>
                  <button
                    type="button"
                    onClick={jumpToSignIn}
                    className={`rounded-full border border-slate-300/80 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white ${LANDING_FOCUS_CLASS}`}
                  >
                    Sign in
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {HERO_FEATURES.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-3xl border border-slate-200/80 bg-white/84 p-4 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.55)] backdrop-blur"
                    >
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-[#faf8f2] shadow-sm">
                        <HeroFeatureIcon type={item.icon} />
                      </div>
                      <div className="mt-4 text-base font-semibold leading-6 text-slate-950">{item.title}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-500">{item.body}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div id="landing-preview" className="scroll-mt-28 xl:pt-1">
                <div className="rounded-[34px] border border-slate-900/85 bg-slate-950 p-6 text-white shadow-[0_44px_120px_-56px_rgba(15,23,42,0.92)] sm:p-7">
                  <div className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-200">Live workspace preview</p>
                      <h3
                        style={{ fontFamily: "'Fraunces', serif" }}
                        className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white"
                      >
                        Client-ready control before the weekly status call.
                      </h3>
                      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                        A single live view for RAID, decisions, and delivery signals so consultancies can brief the client
                        quickly and keep the week under control.
                      </p>
                    </div>
                    <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                      Status pack ready
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="rounded-[28px] border border-white/10 bg-white/6 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Control room</div>
                          <div className="mt-2 text-sm text-slate-300">Weekly delivery signals surfaced for the client-facing update.</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {CONTROL_ITEMS.map((item) => (
                            <div
                              key={item.label}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${item.tone}`}
                            >
                              <span className="text-base font-extrabold text-white">{item.value}</span>
                              <span>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
                      <div className="rounded-[28px] border border-white/10 bg-white/6 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Live control view</div>
                            <div className="mt-2 text-sm text-slate-300">Readiness signals pulled together before the next client touchpoint.</div>
                          </div>
                          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                            This week
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          {WORKSPACE_PHASES.map((phase) => (
                            <div key={phase.title} className="rounded-2xl border border-white/8 bg-slate-900/50 p-3.5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-white">{phase.title}</div>
                                  <div className="text-xs text-slate-400">{phase.status}</div>
                                </div>
                                <div className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${phase.tone}`}>
                                  {phase.percent}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/6 via-white/4 to-teal-500/10 p-4">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          <span>Upcoming this week</span>
                          <span>3 live updates</span>
                        </div>

                        <div className="mt-4 space-y-3">
                          {UPCOMING_ITEMS.map((item) => (
                            <div key={item.title} className="flex gap-3 rounded-2xl border border-white/8 bg-slate-900/55 px-3 py-3">
                              <div className="flex flex-col items-center">
                                <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${item.tone}`} />
                                <span className="mt-2 h-full w-px bg-white/10" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{item.meta}</div>
                                <div className="mt-1 text-sm leading-6 text-slate-100">{item.title}</div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 border-t border-white/10 pt-4">
                          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-teal-100">Why teams use it</div>
                          <div className="mt-3 space-y-2">
                            {PREVIEW_PROOF_POINTS.map((item) => (
                              <div key={item} className="flex items-start gap-2.5 text-sm leading-6 text-slate-200">
                                <span className="mt-2 inline-flex h-2 w-2 rounded-full bg-teal-300" />
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {SHOW_TRUST_BAND && (
              <section className="rounded-[34px] border border-slate-200/85 bg-white/82 p-6 shadow-[0_36px_120px_-70px_rgba(15,23,42,0.35)] backdrop-blur sm:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-700">Built for real delivery teams</p>
                    <h3
                      style={{ fontFamily: "'Fraunces', serif" }}
                      className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950"
                    >
                      Built for consultancies and internal delivery teams.
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                      PM Workspace is designed for teams that need a clearer weekly operating rhythm, cleaner client reporting,
                      and a workspace that still fits the reality of Excel-heavy delivery environments.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 lg:max-w-3xl">
                    {TRUST_BAND_ITEMS.map((item) => (
                      <div
                        key={item}
                        className="rounded-[24px] border border-slate-200 bg-[#faf8f2] px-4 py-4 text-sm leading-6 text-slate-600 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.32)]"
                      >
                        <div className="mb-3 inline-flex h-2.5 w-2.5 rounded-full bg-teal-600" />
                        <div>{item}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section id="landing-features" className="scroll-mt-28 grid items-start gap-8 xl:grid-cols-[1.03fr_0.97fr] xl:gap-10">
              <div className="rounded-[34px] border border-slate-200/85 bg-white/82 p-6 shadow-[0_36px_120px_-70px_rgba(15,23,42,0.45)] backdrop-blur sm:p-7">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-700">What PM Workspace handles</p>
                    <h3
                      style={{ fontFamily: "'Fraunces', serif" }}
                      className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-slate-950"
                    >
                      A proper operating layer for live delivery.
                    </h3>
                  </div>
                  <p className="max-w-md text-sm leading-6 text-slate-500">
                    Built around the weekly reality of delivery work, not around generic task lists or a document dump.
                  </p>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {CAPABILITY_ITEMS.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-[28px] border border-slate-200/85 bg-[#faf8f2] p-5 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.35)]"
                    >
                      <h4 className="text-lg font-semibold text-slate-900">{item.title}</h4>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
              <aside id="auth-panel" className="xl:sticky xl:top-6">
                <div className="rounded-[34px] border border-slate-200/90 bg-white/92 p-6 shadow-[0_42px_120px_-58px_rgba(15,23,42,0.55)] backdrop-blur sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-teal-700">Access PM Workspace</p>
                    <h3 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-slate-950">
                      {isLogin ? 'Welcome back' : 'Open your workspace'}
                    </h3>
                  </div>
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    {TRIAL_OFFER_LABEL}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 rounded-[22px] border border-slate-200 bg-slate-50/90 p-2 text-center">
                  <div className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">Free setup</div>
                  <div className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Trial access</div>
                  <div className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">Upgrade in app</div>
                </div>

                <p className="mt-5 text-sm leading-7 text-slate-600">
                  {isLogin
                    ? 'Sign in to continue planning, reporting, and managing billing from your workspace.'
                    : 'Create an account to start with full Pro access first, then decide later whether you want to stay on a paid plan.'}
                </p>

                <div className="mt-5 space-y-2 rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
                  {AUTH_BENEFITS.map((item) => (
                    <div key={item} className="flex items-start gap-3 text-sm text-slate-600">
                      <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-teal-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => switchMode(true)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${LANDING_FOCUS_CLASS} ${
                      isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode(false)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${LANDING_FOCUS_CLASS} ${
                      !isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Start trial
                  </button>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                  {!isLogin && (
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        Full name
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      Email address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>

                  {successMessage && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {successMessage}
                    </div>
                  )}

                  {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-[0_22px_50px_-26px_rgba(15,23,42,0.85)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 ${LANDING_FOCUS_CLASS}`}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      isLogin ? 'Sign in to workspace' : 'Create account'
                    )}
                  </button>
                </form>

                <div className="mt-6 rounded-[24px] border border-slate-200 bg-[#faf8f2] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">What happens next</div>
                  <div className="mt-3 space-y-2">
                    {ONBOARDING_STEPS.map((step, index) => (
                      <div key={step} className="flex items-center gap-3 text-sm text-slate-600">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {!isLogin && (
                  <label className="mt-6 flex gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={acceptedLegal}
                      onChange={(e) => setAcceptedLegal(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-teal-600"
                    />
                    <span className="leading-6">
                      By creating an account, I agree to the{' '}
                      <a href="/terms" className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4">
                        Terms of Service
                      </a>{' '}
                      and acknowledge the{' '}
                      <a href="/privacy" className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-4">
                        Privacy Notice
                      </a>
                      . I also understand that the service currently uses only essential cookies and similar storage needed to run the workspace.
                    </span>
                  </label>
                )}

                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="text-center text-[13px] text-slate-500">
                    {isLogin ? "Don't have an account yet?" : 'Already have an account?'}
                  </p>
                  <button
                    type="button"
                    onClick={() => switchMode(!isLogin)}
                    className={`mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 ${LANDING_FOCUS_CLASS}`}
                  >
                    {isLogin ? 'Create an account' : 'Sign in instead'}
                  </button>
                </div>

                <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">
                  Your {TRIAL_OFFER_LABEL} begins when your workspace opens. If email confirmation is enabled for your account, you will be asked to verify before signing in.
                </p>
                <div className="mt-3 text-center text-[11px] leading-5 text-slate-400">
                  Need help or want to report a bug?{' '}
                  <button
                    type="button"
                    onClick={handleOpenFeedback}
                    className={`font-semibold text-teal-700 underline decoration-teal-300 underline-offset-2 transition hover:text-teal-800 ${LANDING_FOCUS_CLASS}`}
                  >
                    Email {FEEDBACK_EMAIL}
                  </button>
                </div>
                </div>
              </aside>
            </section>
          </main>

          <footer className="mt-10 border-t border-slate-300/55 pt-6 text-sm text-slate-500">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-slate-900">PM Workspace</div>
                <div className="mt-1">Project delivery workspace for structured weekly control.</div>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                {LEGAL_LINKS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`rounded-full px-3 py-1.5 font-medium text-slate-600 transition hover:bg-white/80 hover:text-slate-950 ${LANDING_FOCUS_CLASS}`}
                  >
                    {item.label}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={handleOpenFeedback}
                  className={`rounded-full px-3 py-1.5 font-medium text-slate-600 transition hover:bg-white/80 hover:text-slate-950 ${LANDING_FOCUS_CLASS}`}
                >
                  Contact
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
