import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, Gear, Plus, SignOut, UserCircle } from '@phosphor-icons/react';
import { supabase } from '../lib/supabase.js';
import { Alert, Logo } from '../ui.jsx';

export default function Library({ profile }) {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('books').select('id, title, subject, class, status').order('created_at', { ascending: false })
      .then(({ data, error }) => { setBooks(data || []); setError(error?.message || ''); });
  }, []);

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-1">
            <Link to="/settings" className="inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
              <Gear size={20} /> <span className="hidden sm:inline">AI settings</span>
            </Link>
            <Link to="/profile" className="inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
              <UserCircle size={20} /> <span className="hidden sm:inline">{profile.name || 'Profile'}</span>
            </Link>
            <button onClick={() => supabase.auth.signOut()} className="inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
              <SignOut size={20} /> <span className="hidden sm:inline">Log out</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your books</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">Class {profile.class}{profile.stream ? ` · ${profile.stream}` : ''} · {profile.medium} medium</p>
          </div>
          <Link to="/books/new" className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong active:scale-[0.98] dark:text-zinc-950">
            <Plus size={18} /> Add a book
          </Link>
        </div>
        <div className="mt-8"><Alert>{error}</Alert></div>
        {books === null && <div className="mt-8 h-32 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />}
        {books?.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
            <BookOpen size={36} className="mx-auto text-accent" />
            <h2 className="mt-4 text-lg font-semibold">No books yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-zinc-600 dark:text-zinc-400">Upload a textbook PDF and it will read every chapter and write your notes.</p>
          </div>
        )}
        {books?.length > 0 && (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {books.map((b) => (
              <li key={b.id}>
                <Link to={`/books/${b.id}`} className="block rounded-2xl border border-zinc-200 p-5 hover:border-accent dark:border-zinc-800">
                  <p className="font-semibold">{b.title}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Class {b.class} · {b.subject} · {b.status === 'done' ? 'Ready' : 'Reading'}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
