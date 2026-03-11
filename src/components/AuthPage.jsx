import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const VALUE_CARDS = [
  {
    title: 'Run delivery in one workspace',
    body: 'Build schedules, RAID logs, trackers, status reports, RACI, costs, and stakeholder registers without juggling separate tools.',
  },
  {
    title: 'Move from plan to payment',
    body: 'Starter, trial, and Pro access are built in, so the product can launch as a real paid SaaS rather than a demo.',
  },
  {
    title: 'Import Excel, then keep working online',
    body: 'Bring in existing plans, keep exporting when needed, and avoid forcing users to rebuild everything from scratch.',
  },
  {
    title: 'Use AI where it actually helps',
    body: 'Generate project plans, reports, and assistant-driven edits without making AI the whole product.',
  },
];

const STARTER_FEATURES = [
  '3 projects',
  '30 tasks per project',
  'Schedule, Issues, Actions, Tracker',
  'Excel import and export',
];

const PRO_FEATURES = [
  'Full register set and all tabs',
  'AI reports and AI assistant',
  'Baseline snapshots',
  'Billing and plan management',
];

const LAUNCH_SIGNALS = [
  { value: '16', label: 'project registers' },
  { value: '30-day', label: 'Pro trial' },
  { value: 'Stripe', label: 'subscription billing' },
];

const AuthPage = () => {
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

        setSuccessMessage(`Check ${email} for your confirmation link, then sign in to start your trial.`);
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_24%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_52%,_#eef4ff_100%)]">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-200/40 blur-3xl" />
          <div className="absolute top-32 right-0 h-80 w-80 rounded-full bg-sky-100/60 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-indigo-100/40 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-2xl font-black text-white shadow-lg shadow-indigo-200/70">
                P
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">PM OS</p>
                <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Project Manager OS</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600">
                30-day Pro trial. No card required to start.
              </span>
              <button
                onClick={jumpToSignup}
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800"
              >
                Start free trial
              </button>
            </div>
          </header>

          <main className="mt-8 grid items-start gap-8 xl:grid-cols-[1.15fr_0.85fr] xl:gap-12">
            <section className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700 shadow-sm">
                Launch-ready project ops
              </div>

              <div className="max-w-3xl">
                <h2 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-[3.5rem] lg:leading-[1.02]">
                  Plan, track, and upgrade projects in one operating system.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  PM OS gives solo operators and small teams one place to run delivery work:
                  schedules, registers, status reporting, AI support, and subscription billing that is ready for a real launch.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {LAUNCH_SIGNALS.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm shadow-slate-200/40 backdrop-blur">
                    <div className="text-2xl font-black text-slate-900">{item.value}</div>
                    <div className="mt-1 text-sm text-slate-500">{item.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {VALUE_CARDS.map((card) => (
                  <div key={card.title} className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm shadow-slate-200/40 backdrop-blur">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-sm font-bold text-indigo-700">
                      +
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{card.body}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1.05fr]">
                <div className="rounded-[28px] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-[0_30px_90px_-45px_rgba(15,23,42,0.75)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200">What Launch Includes</p>
                  <h3 className="mt-3 text-2xl font-bold">A commercial MVP, not just a planning demo.</h3>
                  <div className="mt-5 space-y-3 text-sm text-slate-200">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">Schedule, RAID logs, tracker, status reports, and stakeholder controls in one product.</div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">Starter, trial, and Pro access control already wired to Stripe subscription billing.</div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">Excel-friendly workflows for teams moving from static plans into a live workspace.</div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-sm shadow-slate-200/40 backdrop-blur">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-700">Pricing Snapshot</p>
                      <h3 className="mt-3 text-2xl font-bold text-slate-900">Launch with a simple Starter to Pro path.</h3>
                    </div>
                    <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Live on April 1
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="text-sm font-semibold text-slate-900">Starter</div>
                      <div className="mt-2 text-3xl font-black text-slate-900">£0</div>
                      <p className="mt-1 text-sm text-slate-500">Free forever</p>
                      <ul className="mt-4 space-y-2 text-sm text-slate-600">
                        {STARTER_FEATURES.map((feature) => (
                          <li key={feature}>- {feature}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                      <div className="text-sm font-semibold text-indigo-900">Pro</div>
                      <div className="mt-2 text-3xl font-black text-slate-900">£7.99</div>
                      <p className="mt-1 text-sm text-slate-500">or £67 yearly</p>
                      <ul className="mt-4 space-y-2 text-sm text-slate-700">
                        {PRO_FEATURES.map((feature) => (
                          <li key={feature}>- {feature}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <aside id="auth-panel" className="xl:sticky xl:top-6">
              <div className="rounded-[32px] border border-slate-200/90 bg-white/95 p-6 shadow-[0_40px_120px_-52px_rgba(15,23,42,0.5)] backdrop-blur sm:p-8">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                  <span className="font-semibold">Launch path:</span> create an account, verify email, start the 30-day Pro trial, then upgrade when ready.
                </div>

                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Access PM OS
                  </p>
                  <h3 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                    {isLogin ? 'Welcome back' : 'Create your account'}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {isLogin
                      ? 'Sign in to open your projects, billing, and reports.'
                      : 'New accounts start with a 30-day Pro trial so you can test the full workflow before paying.'}
                  </p>
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
                      <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Full Name</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="John Smith"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Password</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                    className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                      isLogin ? 'Sign in to PM OS' : 'Create account and start trial'
                    )}
                  </button>
                </form>

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
                  Built for professional project delivery. Trial access starts after signup and email confirmation.
                </p>
              </div>
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
