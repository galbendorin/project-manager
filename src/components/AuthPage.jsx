import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import PmWorkspaceLogo from './PmWorkspaceLogo';
import {
  TRIAL_FULL_ACCESS_LABEL,
  TRIAL_OFFER_LABEL,
} from '../utils/trialOffer';
import { FEEDBACK_EMAIL, openFeedbackEmail } from '../utils/feedback';

const HERO_BULLETS = [
  'Single workspace for planning and controls',
  'Designed for client-facing project delivery',
  'Clear enough for teams, detailed enough for PMs',
];

const HERO_TRAIL_ITEMS = [
  'Schedule + Gantt',
  'RAID + Actions',
  'AI-assisted reporting',
];

const CAPABILITY_ITEMS = [
  {
    icon: 'workspace',
    title: 'Plan and track in one view',
    body: 'Build schedules, manage dependencies, track milestones, and keep execution visible without jumping between tools.',
  },
  {
    icon: 'shield',
    title: 'RAID built into the workflow',
    body: 'Risks, issues, change control, comms, and actions live next to the schedule so the project story stays connected.',
  },
  {
    icon: 'spark',
    title: 'AI that helps the PM',
    body: 'Draft updates, break down tasks, and generate action-based reporting faster without losing control of the detail.',
  },
  {
    icon: 'spreadsheet',
    title: 'Excel-friendly by design',
    body: 'Import what teams already use, export when needed, and keep adoption easy for clients and internal stakeholders.',
  },
];

const AUTH_BENEFITS = [
  `${TRIAL_OFFER_LABEL} with full workspace access`,
  'No card required to create an account',
  'Email verification before the workspace opens',
];

const DASHBOARD_TASKS = [
  {
    title: 'Kick-off complete',
    value: '100%',
    badgeTone: 'bg-emerald-50 text-emerald-700',
    track: 'w-full',
  },
  {
    title: 'Technical workshop',
    value: '65%',
    badgeTone: 'bg-amber-50 text-amber-700',
    track: 'w-[65%]',
  },
  {
    title: 'Pilot migration',
    value: '35%',
    badgeTone: 'bg-indigo-50 text-indigo-700',
    track: 'w-[35%]',
  },
  {
    title: 'Client action tracker',
    value: 'Open',
    badgeTone: 'bg-rose-50 text-rose-700',
    track: 'w-[20%]',
  },
];

const DASHBOARD_MODULES = [
  { title: 'Schedule', hint: 'Open', tone: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  { title: 'Risks', hint: 'Open', tone: 'bg-amber-50 border-amber-200 text-amber-700' },
  { title: 'Issues', hint: 'Open', tone: 'bg-rose-50 border-rose-200 text-rose-700' },
  { title: 'Change Control', hint: 'Open', tone: 'bg-sky-50 border-sky-200 text-sky-700' },
  { title: 'Comms Plan', hint: 'Open', tone: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700' },
  { title: 'Actions', hint: 'Open', tone: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
];

const LANDING_NAV_ITEMS = [
  { label: 'Features', target: 'features' },
  { label: 'Modules', target: 'modules' },
  { label: 'Why it works', target: 'why' },
];

const LANDING_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

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

const AUTH_MODES = {
  SIGN_IN: 'sign-in',
  SIGN_UP: 'sign-up',
  RESET_REQUEST: 'reset-request',
  RESET_COMPLETE: 'reset-complete',
};

const RESET_REQUEST_STEPS = [
  'Enter the email you use for PM Workspace',
  'Open the recovery email from PM Workspace',
  'Return here to set a new password',
];

const RESET_COMPLETE_STEPS = [
  'Create a new password with at least 6 characters',
  'Save it from this same screen',
  'Sign in again with the updated password',
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

  if (type === 'shield') {
    return (
      <svg {...shared}>
        <path d="M12 3.5l6 2.5v5.4c0 4.2-2.6 7.4-6 9.1-3.4-1.7-6-4.9-6-9.1V6l6-2.5z" />
        <path d="M9.2 11.8l1.9 1.9 3.7-4" />
      </svg>
    );
  }

  if (type === 'spark') {
    return (
      <svg {...shared}>
        <path d="M12 4.5l1.8 3.7L17.5 10l-3.7 1.8L12 15.5l-1.8-3.7L6.5 10l3.7-1.8L12 4.5z" />
        <path d="M18.5 4.5l.8 1.6 1.7.9-1.7.8-.8 1.7-.9-1.7-1.6-.8 1.6-.9.9-1.6z" />
        <path d="M5.5 14.5l1 2 2 .9-2 .9-1 2-.9-2-2-.9 2-.9.9-2z" />
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
  const [authMode, setAuthMode] = useState(AUTH_MODES.SIGN_IN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  const {
    user,
    loading: authLoading,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    isPasswordRecovery,
    clearPasswordRecovery,
  } = useAuth();

  const isLogin = authMode === AUTH_MODES.SIGN_IN;
  const isSignup = authMode === AUTH_MODES.SIGN_UP;
  const isResetRequest = authMode === AUTH_MODES.RESET_REQUEST;
  const isResetComplete = authMode === AUTH_MODES.RESET_COMPLETE;
  const isRecoveryMode = isResetRequest || isResetComplete;
  const panelTitle = isResetComplete
    ? 'Set a new password'
    : isResetRequest
      ? 'Reset your password'
      : isLogin
        ? 'Welcome back'
        : 'Open your workspace';
  const panelEyebrow = isRecoveryMode ? 'Password recovery' : 'Access PM Workspace';
  const panelBadge = isRecoveryMode ? 'Secure access' : TRIAL_OFFER_LABEL;
  const panelDescription = isResetComplete
    ? 'Choose a new password for your workspace account and save it here.'
    : isResetRequest
      ? 'Enter your email address and we will send a recovery link if an account exists.'
      : isLogin
        ? 'Sign in to continue planning, reporting, and managing billing from your workspace.'
        : 'Create an account to start with full Pro access first, then decide later whether you want to stay on a paid plan.';
  const helperItems = isResetComplete
    ? RESET_COMPLETE_STEPS
    : isResetRequest
      ? RESET_REQUEST_STEPS
      : ONBOARDING_STEPS;

  useEffect(() => {
    if (isPasswordRecovery) {
      setAuthMode(AUTH_MODES.RESET_COMPLETE);
      setError(null);
      setSuccessMessage('');
      setPassword('');
      setConfirmPassword('');
      if (user?.email) {
        setEmail(user.email);
      }
      return;
    }

    setAuthMode((currentMode) => (
      currentMode === AUTH_MODES.RESET_COMPLETE
        ? AUTH_MODES.SIGN_IN
        : currentMode
    ));
  }, [isPasswordRecovery, user?.email]);

  useEffect(() => {
    if (isPasswordRecovery && !authLoading && !user) {
      setError('This password reset link is invalid or expired. Request a new one and try again.');
    }
  }, [authLoading, isPasswordRecovery, user]);

  const setCardMode = async (nextMode) => {
    if (isPasswordRecovery) {
      const { error: clearError } = await clearPasswordRecovery({ signOutSession: true });
      if (clearError) {
        setError(clearError.message || 'Unable to leave password recovery right now.');
        return;
      }
    }

    setAuthMode(nextMode);
    setError(null);
    setSuccessMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const jumpToAuth = (nextMode) => {
    void setCardMode(nextMode);

    window.requestAnimationFrame(() => {
      document.getElementById('auth-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const jumpToSignup = () => {
    jumpToAuth(AUTH_MODES.SIGN_UP);
  };

  const jumpToSignin = () => {
    jumpToAuth(AUTH_MODES.SIGN_IN);
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
      } else if (isSignup) {
        if (!acceptedLegal) {
          throw new Error('Please accept the Terms of Service and Privacy Notice to create an account.');
        }

        const { data, error: signUpError } = await signUp(email, password, fullName);
        if (signUpError) throw signUpError;

        if (data?.session) {
          setSuccessMessage('Your account is ready. Opening your workspace now.');
        } else {
          setSuccessMessage(`Check ${email} for your confirmation email if verification is enabled, then sign in to enter your workspace.`);
          setAuthMode(AUTH_MODES.SIGN_IN);
        }
        setPassword('');
        setFullName('');
      } else if (isResetRequest) {
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
          throw new Error('Enter your email address to request a password reset link.');
        }

        const { error: resetError } = await requestPasswordReset(trimmedEmail);
        if (resetError) throw resetError;
        setSuccessMessage('If an account exists for this email, a password reset link has been sent.');
      } else if (isResetComplete) {
        if (!password.trim()) {
          throw new Error('Enter a new password.');
        }
        if (password.length < 6) {
          throw new Error('Use a password with at least 6 characters.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        if (!user) {
          throw new Error('This password reset link is invalid or expired. Request a new one and try again.');
        }

        const resetEmail = user.email || email;
        const { error: updateError } = await updatePassword(password);
        if (updateError) {
          const updateMessage = String(updateError.message || '').toLowerCase();
          if (updateMessage.includes('session') || updateMessage.includes('expired')) {
            throw new Error('This password reset link is invalid or expired. Request a new one and try again.');
          }
          throw updateError;
        }

        await clearPasswordRecovery({ signOutSession: true });
        setAuthMode(AUTH_MODES.SIGN_IN);
        setEmail(resetEmail);
        setPassword('');
        setConfirmPassword('');
        setSuccessMessage('Password updated. Sign in with your new password.');
      }
    } catch (err) {
      const message = String(err?.message || 'Unable to complete this request right now.');
      if (message.toLowerCase().includes('rate limit')) {
        setError('Too many password reset emails were requested. Please wait a moment and try again.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }} className="min-h-screen bg-white text-slate-900">
      <div className="absolute inset-x-0 top-0 -z-10 overflow-hidden">
        <div className="mx-auto h-[520px] max-w-7xl bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(139,92,246,0.12),transparent_28%),linear-gradient(to_bottom,#eef2ff,transparent_62%)]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <button
            type="button"
            onClick={() => jumpToSection('hero')}
            className={`flex items-center gap-3 text-left ${LANDING_FOCUS_CLASS}`}
            aria-label="Back to top"
          >
            <PmWorkspaceLogo iconOnly size="xs" />
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900">PM Workspace</div>
              <div className="text-xs text-slate-500">Project management, without the chaos</div>
            </div>
          </button>

          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex" aria-label="Landing page">
            {LANDING_NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => jumpToSection(item.target)}
                className={`transition hover:text-slate-900 ${LANDING_FOCUS_CLASS}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={jumpToSignin}
              className={`rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 ${LANDING_FOCUS_CLASS}`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={jumpToSignup}
              className={`rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 ${LANDING_FOCUS_CLASS}`}
            >
              Start free trial
            </button>
          </div>
        </div>
      </header>

      <main>
        <section id="hero" className="mx-auto grid max-w-7xl gap-14 px-6 pb-20 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-28 lg:pt-20">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-700 shadow-sm">
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 2.5l1.2 2.5L11.8 6.2 9.3 7.4 8 10 6.7 7.4 4.2 6.2 6.8 5 8 2.5z" />
              </svg>
              Built for delivery-focused project managers
            </div>

            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              One workspace for your plan,
              <span className="text-indigo-600"> RAID, actions, and reporting.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              PM Workspace brings schedule management, project controls, and AI support into one clean environment so
              you can run projects with more clarity and less admin.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-1">
              {HERO_BULLETS.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3.5 8.5l2.5 2.5 6-6" />
                    </svg>
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={jumpToSignup}
                className={`inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 ${LANDING_FOCUS_CLASS}`}
              >
                Try PM Workspace
                <svg className="ml-2 h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 8h9" />
                  <path d="M8.5 3l4.5 5-4.5 5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => jumpToSection('why')}
                className={`rounded-2xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white ${LANDING_FOCUS_CLASS}`}
              >
                See how it works
              </button>
            </div>

            <div className="mt-8 flex flex-wrap gap-6 text-sm text-slate-500">
              {HERO_TRAIL_ITEMS.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-600 text-xs font-bold text-white">
                      PM
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Programme Dashboard</div>
                      <div className="text-xs text-slate-500">Live delivery workspace</div>
                    </div>
                  </div>
                  <div className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                    AI Ready
                  </div>
                </div>
              </div>

              <div className="grid gap-0 md:grid-cols-[0.95fr_1.05fr]">
                <div className="border-b border-slate-200 bg-white p-4 md:border-b-0 md:border-r">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tasks</div>
                    <div className="text-xs text-slate-400">14 items</div>
                  </div>

                  <div className="space-y-2">
                    {DASHBOARD_TASKS.map((item) => (
                      <div key={item.title} className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-3">
                        <div>
                          <div className="text-sm font-medium text-slate-800">{item.title}</div>
                          <div className="mt-1 h-1.5 w-28 rounded-full bg-slate-100">
                            <div className={`h-1.5 rounded-full bg-indigo-500 ${item.track}`} />
                          </div>
                        </div>
                        <div className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.badgeTone}`}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project controls</div>
                    <div className="text-xs text-slate-400">RAID + comms</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {DASHBOARD_MODULES.map((module) => (
                      <div key={module.title} className={`rounded-2xl border px-3 py-3 ${module.tone}`}>
                        <div className="text-xs font-semibold uppercase tracking-wide">{module.title}</div>
                        <div className="mt-4 flex items-center justify-between text-xs opacity-80">
                          <span>{module.hint}</span>
                          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 3.5L10.5 8 5 12.5" />
                          </svg>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <svg className="h-4 w-4 text-violet-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3.5 4.5h9v7h-9z" />
                        <path d="M6 8h4" />
                        <path d="M6 10.5h2.5" />
                      </svg>
                      AI status summary
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Pilot workstream is progressing, two client actions remain open, and next week&apos;s focus is migration readiness and stakeholder alignment.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-sm font-semibold text-indigo-600">What makes it different</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Built for the way real projects are actually run.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Not just timelines. Not just registers. PM Workspace connects planning, control, communication, and
              follow-up in one practical system.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {CAPABILITY_ITEMS.map((feature) => (
              <div key={feature.title} className="h-full rounded-[24px] border border-slate-200 bg-white shadow-sm">
                <div className="p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <HeroFeatureIcon type={feature.icon} />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="modules" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                {DASHBOARD_MODULES.map((module) => (
                  <div key={module.title} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${module.tone}`}>
                      {module.title}
                    </div>
                    <div className="mt-4 text-sm font-semibold text-slate-900">Consistent layout</div>
                    <div className="mt-2 text-sm leading-7 text-slate-600">
                      Use the accent as a label and highlight, not as a full-page colour. That keeps the workspace calm and professional.
                    </div>
                  </div>
                ))}
              </div>

            </div>

            <div id="auth-panel" className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-indigo-600">{panelEyebrow}</p>
                  <h3 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                    {panelTitle}
                  </h3>
                </div>
                <div className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isRecoveryMode
                    ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  {panelBadge}
                </div>
              </div>

              {!isRecoveryMode ? (
                <div className="mt-5 grid grid-cols-3 gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-2 text-center">
                  <div className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">Free setup</div>
                  <div className="rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm">Trial access</div>
                  <div className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">Upgrade in app</div>
                </div>
              ) : null}

              <p className="mt-5 text-sm leading-7 text-slate-600">
                {panelDescription}
              </p>

              <div className="mt-5 space-y-2 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                {(isRecoveryMode ? helperItems : AUTH_BENEFITS).map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-slate-600">
                    <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              {!isRecoveryMode ? (
                <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => void setCardMode(AUTH_MODES.SIGN_IN)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${LANDING_FOCUS_CLASS} ${
                      isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => void setCardMode(AUTH_MODES.SIGN_UP)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${LANDING_FOCUS_CLASS} ${
                      isSignup ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Start trial
                  </button>
                </div>
              ) : null}

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                {isSignup ? (
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
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                ) : null}

                {!isResetComplete ? (
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
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                ) : null}

                {!isResetRequest ? (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      {isResetComplete ? 'New password' : 'Password'}
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isResetComplete ? 'Create a new password' : 'Minimum 6 characters'}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                ) : null}

                {isResetComplete ? (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      Confirm password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your new password"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                ) : null}

                {isLogin ? (
                  <div className="-mt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void setCardMode(AUTH_MODES.RESET_REQUEST)}
                      className={`text-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-4 transition hover:text-indigo-800 ${LANDING_FOCUS_CLASS}`}
                    >
                      Forgot password?
                    </button>
                  </div>
                ) : null}

                {successMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {successMessage}
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 ${LANDING_FOCUS_CLASS}`}
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
                    isResetComplete
                      ? 'Save new password'
                      : isResetRequest
                        ? 'Send reset link'
                        : isLogin
                          ? 'Sign in to workspace'
                          : 'Create account'
                  )}
                </button>

                {isRecoveryMode ? (
                  <button
                    type="button"
                    onClick={() => void setCardMode(AUTH_MODES.SIGN_IN)}
                    className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 ${LANDING_FOCUS_CLASS}`}
                  >
                    Back to sign in
                  </button>
                ) : null}
              </form>

              <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {isRecoveryMode ? 'Reset steps' : 'What happens next'}
                </div>
                <div className="mt-3 space-y-2">
                  {helperItems.map((step, index) => (
                    <div key={step} className="flex items-center gap-3 text-sm text-slate-600">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {isSignup ? (
                <label className="mt-6 flex gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={acceptedLegal}
                    onChange={(e) => setAcceptedLegal(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
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
              ) : null}

              {!isRecoveryMode ? (
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="text-center text-[13px] text-slate-500">
                    {isLogin ? "Don't have an account yet?" : 'Already have an account?'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void setCardMode(isLogin ? AUTH_MODES.SIGN_UP : AUTH_MODES.SIGN_IN)}
                    className={`mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 ${LANDING_FOCUS_CLASS}`}
                  >
                    {isLogin ? 'Create an account' : 'Sign in instead'}
                  </button>
                </div>
              ) : null}

              {!isRecoveryMode ? (
                <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">
                  Your {TRIAL_OFFER_LABEL} begins when your workspace opens. If email confirmation is enabled for your account, you will be asked to verify before signing in.
                </p>
              ) : null}
              <div className="mt-3 text-center text-[11px] leading-5 text-slate-400">
                Need help or want to report a bug?{' '}
                <button
                  type="button"
                  onClick={handleOpenFeedback}
                  className={`font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 transition hover:text-indigo-800 ${LANDING_FOCUS_CLASS}`}
                >
                  Email {FEEDBACK_EMAIL}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="why" className="mx-auto max-w-7xl px-6 pb-24 lg:px-8">
          <div className="rounded-[32px] border border-slate-200 bg-slate-950 px-6 py-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] lg:px-8 lg:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-[22rem]">
                <div className="text-sm font-semibold text-white">PM Workspace</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">
                  Project delivery workspace for structured weekly control.
                </div>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm xl:max-w-[42rem] xl:justify-end">
                {LEGAL_LINKS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`font-medium text-slate-300 transition hover:text-white ${LANDING_FOCUS_CLASS}`}
                  >
                    {item.label}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={handleOpenFeedback}
                  className={`font-medium text-slate-300 transition hover:text-white ${LANDING_FOCUS_CLASS}`}
                >
                  Contact
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
