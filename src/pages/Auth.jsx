import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '../lib/supabase.js';
import { BookOpenText, CalendarCheck, Exam, GoogleLogo } from '@phosphor-icons/react';
import { Alert, Button, Field, Logo } from '../ui.jsx';

const COPY = {
  login: { title: 'Welcome back', sub: 'Log in to open your books, notes and plan.', cta: 'Log in' },
  signup: { title: 'Create your account', sub: 'Upload your textbook and get notes, sheets and a study plan.', cta: 'Create account' },
  forgot: { title: 'Reset your password', sub: 'We will email you a link to set a new password.', cta: 'Send reset link' },
  reset: { title: 'Set a new password', sub: 'Choose a password with at least 8 characters.', cta: 'Save password' },
};

// One page for log in, sign up, forgot password and the reset link landing.
export default function Auth({ mode }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const c = COPY[mode];

  async function google() {
    setError('');
    // Ask Supabase first: a disabled provider would otherwise land on a raw error page.
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_KEY } }).catch(() => null);
    const settings = await res?.json().catch(() => null);
    if (!settings?.external?.google) return setError('Google sign-in is not set up yet. Use email and password for now.');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) setError(error.message);
  }

  async function submit(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true); setError(''); setDone('');
    const redirect = window.location.origin;
    const { data, error } =
      mode === 'login' ? await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
      : mode === 'signup' ? await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { name: f.name }, emailRedirectTo: redirect } })
      : mode === 'forgot' ? await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: `${redirect}/reset` })
      : await supabase.auth.updateUser({ password: f.password });
    setBusy(false);
    if (error) return setError(error.message);
    if (mode === 'signup' && !data.session) return setDone('Check your email and click the confirmation link, then log in.');
    if (mode === 'forgot') return setDone('If that email has an account, a reset link is on its way.');
    nav('/');
  }

  return (
    <main className="grid min-h-[100dvh] md:grid-cols-[1fr_1.1fr]">
      <section className="flex flex-col px-4 py-8 sm:px-10 md:py-12">
        <Logo />
        <div className="my-auto w-full max-w-sm py-10">
          <h1 className="text-3xl font-semibold tracking-tight">{c.title}</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">{c.sub}</p>
          <form onSubmit={submit} className="mt-8 grid gap-5">
            {mode === 'signup' && <Field label="Your name" name="name" autoComplete="name" required />}
            {mode !== 'reset' && <Field label="Email" name="email" type="email" autoComplete="email" required />}
            {mode !== 'forgot' && (
              <Field label={mode === 'reset' ? 'New password' : 'Password'} name="password" type="password" minLength={8} required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                hint={mode === 'login' ? undefined : 'At least 8 characters.'} />
            )}
            <Alert>{error}</Alert>
            <Alert kind="ok">{done}</Alert>
            <Button disabled={busy}>{busy ? 'Please wait…' : c.cta}</Button>
          </form>
          {(mode === 'login' || mode === 'signup') && (
            <>
              <div className="my-5 flex items-center gap-3 text-sm text-zinc-500">
                <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              </div>
              <Button type="button" variant="secondary" className="w-full" onClick={google}>
                <GoogleLogo size={18} weight="bold" /> Continue with Google
              </Button>
            </>
          )}
          <div className="mt-6 grid gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            {mode === 'login' && <>
              <Link className="font-medium text-accent hover:underline" to="/forgot">Forgot password?</Link>
              <p>New here? <Link className="font-medium text-accent hover:underline" to="/signup">Create an account</Link></p>
            </>}
            {mode !== 'login' && <p>Have an account? <Link className="font-medium text-accent hover:underline" to="/login">Log in</Link></p>}
          </div>
        </div>
      </section>
      <aside className="hidden flex-col justify-center gap-10 bg-accent px-12 text-white md:flex dark:bg-zinc-900 dark:text-zinc-100">
        <h2 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">Your textbook in. <span className="whitespace-nowrap">Exam-ready</span> notes out.</h2>
        <ul className="grid max-w-md gap-6">
          {[
            [BookOpenText, 'Reads every page', 'Upload your NCERT or reference book. Every chapter is read in full, start to finish.'],
            [Exam, 'Notes, sheets and worksheets', 'Revision sheets, formula tables, mind maps and CBSE-pattern questions with answers.'],
            [CalendarCheck, 'A plan to the exam', 'A day-by-day schedule that moves with you when you miss a day.'],
          ].map(([Icon, title, text]) => (
            <li key={title} className="flex gap-4">
              <Icon size={28} className="shrink-0 opacity-90" />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-white/80 dark:text-zinc-400">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
