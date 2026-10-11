import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { supabase } from './lib/supabase.js';
import Auth from './pages/Auth.jsx';
import Profile from './pages/Profile.jsx';
import Library from './pages/Library.jsx';
// Heavy pages (PDF reader, maths, AI SDK) load only when opened, so sign-in stays fast on phones.
const NewBook = lazy(() => import('./pages/NewBook.jsx'));
const Book = lazy(() => import('./pages/Book.jsx'));
const NoteView = lazy(() => import('./pages/NoteView.jsx'));
const NoteBody = lazy(() => import('./pages/NoteView.jsx').then((m) => ({ default: m.NoteBody })));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Planner = lazy(() => import('./pages/Planner.jsx'));
import './index.css';

function App() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') window.history.replaceState(null, '', '/reset');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setProfile(null);
    if (session) supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => setProfile(data));
  }, [session?.user.id]);

  if (session === undefined || (session && !profile)) return loading;

  const authed = (el) => (session ? el : <Navigate to="/login" replace />);
  const needsProfile = session && !profile.class;
  return (
    <Suspense fallback={loading}>
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Auth mode="login" />} />
      <Route path="/signup" element={session ? <Navigate to="/" replace /> : <Auth mode="signup" />} />
      <Route path="/forgot" element={<Auth mode="forgot" />} />
      <Route path="/reset" element={authed(<Auth mode="reset" />)} />
      <Route path="/profile" element={authed(<Profile profile={profile} onSaved={setProfile} />)} />
      <Route path="/books/new" element={authed(<NewBook profile={profile} />)} />
      <Route path="/books/:id" element={authed(<Book profile={profile} />)} />
      <Route path="/notes/:id" element={authed(<NoteView />)} />
      <Route path="/settings" element={authed(<Settings />)} />
      <Route path="/books/:id/plan" element={authed(<Planner profile={profile} />)} />
      {/* Dev only: renders Markdown from localStorage 'devNote' to check the notes viewer without an account */}
      {import.meta.env.DEV && <Route path="/dev/note" element={<main className="mx-auto max-w-3xl px-4 py-8"><NoteBody markdown={localStorage.getItem('devNote') || '# Empty'} /></main>} />}
      <Route path="*" element={authed(needsProfile ? <Navigate to="/profile" replace /> : <Library profile={profile} />)} />
    </Routes>
    </Suspense>
  );
}

const loading = <div className="grid min-h-[100dvh] place-items-center"><div className="h-2 w-40 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" /></div>;

createRoot(document.getElementById('root')).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
);
