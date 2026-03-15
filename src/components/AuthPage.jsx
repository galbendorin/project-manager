import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  TRIAL_FULL_ACCESS_LABEL,
  TRIAL_OFFER_LABEL,
  TRIAL_SHORT_LABEL,
} from '../utils/trialOffer';

const AUDIENCE_TAGS = [
  'Consultancies',
  'Independent PMs',
  'Internal delivery teams',
];

const HERO_METRICS = [
  { value: '16', label: 'core registers' },
  { value: TRIAL_SHORT_LABEL, label: 'free trial' },
  { value: 'Excel', label: 'import and export ready' },
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
  { title: 'Mobilisation and planning', status: 'Complete', percent: '100%', tone: 'bg-emerald-400' },
  { title: 'Design and dependency mapping', status: 'In progress', percent: '68%', tone: 'bg-amber-300' },
  { title: 'Delivery and go-live readiness', status: 'Planned', percent: '24%', tone: 'bg-sky-300' },
];

const CONTROL_ITEMS = [
  ['4', 'open risks'],
  ['7', 'actions due'],
  ['2', 'decisions pending'],
  ['1', 'status pack drafted'],
];

const ONBOARDING_STEPS = [
  'Verify your email address',
  'Open your workspace',
  TRIAL_FULL_ACCESS_LABEL,
];

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const { signIn, signUp } = useAuth();

  const switchMode = (nextIsLogin) => {
    setIsLogin(nextIsLogin);
    setError(null);
  };

  const jumpToSignup = () => {
    switchMode(false);
    setSuccessMessage('');

    window.requestAnimationFrame(() => {
      document.getElementById('auth-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
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
        const { error: signUpError } = await signUp(email, password, fullName);
        if (signUpError) throw signUpError;

        setSuccessMessage(`Check ${email} for your confirmation email, then sign in to enter your workspace.`);
        setIsLogin(true);
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
      <div className="relative overflow-hidden">
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
          <header className="flex flex-col gap-5 border-b border-slate-300/55 pb-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-extrabold text-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.9)]">
                PM
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-teal-700">PM OS</p>
                <h1 className="text-lg font-semibold text-slate-950 sm:text-xl">Project Delivery Workspace</h1>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              {AUDIENCE_TAGS.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-300/80 bg-white/75 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 backdrop-blur"
                >
                  {tag}
                </span>
              ))}
            </div>
          </header>

          <main className="mt-10 grid items-start gap-8 xl:mt-14 xl:grid-cols-[1.03fr_0.97fr] xl:gap-10">
            <section className="space-y-8 xl:pr-4">
              <div className="space-y-6">
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
                    onClick={jumpToSignup}
                    className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.85)] transition hover:bg-slate-800"
                  >
                    Start free trial
                  </button>
                  <button
                    onClick={() => switchMode(true)}
                    className="rounded-full border border-slate-300/80 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
                  >
                    Sign in
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {HERO_METRICS.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-3xl border border-slate-200/80 bg-white/84 p-4 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.55)] backdrop-blur"
                    >
                      <div className="text-2xl font-extrabold text-slate-950">{item.value}</div>
                      <div className="mt-1 text-sm text-slate-500">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[34px] border border-slate-200/85 bg-white/82 p-6 shadow-[0_36px_120px_-70px_rgba(15,23,42,0.45)] backdrop-blur sm:p-7">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-700">What PM OS handles</p>
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
            </section>

            <aside id="auth-panel" className="space-y-5 xl:sticky xl:top-6">
              <div className="rounded-[34px] border border-slate-900/85 bg-slate-950 p-6 text-white shadow-[0_44px_120px_-56px_rgba(15,23,42,0.92)] sm:p-7">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-200">Live workspace preview</p>
                    <h3
                      style={{ fontFamily: "'Fraunces', serif" }}
                      className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white"
                    >
                      A control room for the week ahead.
                    </h3>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    Client pack ready
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
                  <div className="rounded-[28px] border border-white/10 bg-white/6 p-4">
                    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Programme overview</div>
                        <div className="text-xs text-slate-400">Network migration and launch readiness</div>
                      </div>
                      <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                        On track
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {WORKSPACE_PHASES.map((phase) => (
                        <div key={phase.title} className="rounded-2xl border border-white/8 bg-slate-900/50 p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">{phase.title}</div>
                              <div className="text-xs text-slate-400">{phase.status}</div>
                            </div>
                            <div className="text-sm font-bold text-white">{phase.percent}</div>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-white/10">
                            <div className={`h-2 rounded-full ${phase.tone}`} style={{ width: phase.percent }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-[22px] border border-white/8 bg-white/5 p-4">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        <span>Upcoming this week</span>
                        <span>3 milestones</span>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-200">
                        <div className="rounded-2xl bg-slate-900/60 px-3 py-2.5">Dependency review with infrastructure team</div>
                        <div className="rounded-2xl bg-slate-900/60 px-3 py-2.5">Draft status report prepared from live registers</div>
                        <div className="rounded-2xl bg-slate-900/60 px-3 py-2.5">Launch readiness checkpoint with stakeholders</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[28px] border border-white/10 bg-white/6 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Control room</div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        {CONTROL_ITEMS.map(([value, label]) => (
                          <div key={label} className="rounded-2xl bg-slate-900/60 px-3 py-4">
                            <div className="text-xl font-extrabold text-white">{value}</div>
                            <div className="mt-1 text-xs text-slate-400">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-teal-500/18 to-white/5 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-teal-100">Built for real PM work</div>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
                        <p>One place for schedules, registers, and status reporting.</p>
                        <p>Structured enough for delivery control, clean enough for client-facing outputs.</p>
                        <p>Billing and plan changes are handled inside the same product.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[34px] border border-slate-200/90 bg-white/92 p-6 shadow-[0_42px_120px_-58px_rgba(15,23,42,0.55)] backdrop-blur sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-teal-700">Access PM OS</p>
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
                    onClick={() => switchMode(true)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => switchMode(false)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
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
                    className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-[0_22px_50px_-26px_rgba(15,23,42,0.85)] transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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

                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="text-center text-[13px] text-slate-500">
                    {isLogin ? "Don't have an account yet?" : 'Already have an account?'}
                  </p>
                  <button
                    onClick={() => switchMode(!isLogin)}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    {isLogin ? 'Create an account' : 'Sign in instead'}
                  </button>
                </div>

                <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">
                  Your {TRIAL_OFFER_LABEL} begins after email verification. Billing upgrades are managed inside the workspace.
                </p>
              </div>
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
}
